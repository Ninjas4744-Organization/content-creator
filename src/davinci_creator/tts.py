"""Gemini REST TTS with content-addressed cache and no stored credentials."""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path
from .common import fingerprint, voice_signature, write_json, local_file

DEFAULT_MODEL="gemini-3.8-flash-tts"
DEFAULT_VOICES={"female":"Kore","male":"Puck"}
DEFAULT_STYLE="Native Israeli Hebrew; warm, clear, energetic; exact transcript only."


def cached_voice(scene,doc,folder:Path,model=DEFAULT_MODEL):
    manifest_path=folder/"manifest.json"
    if not manifest_path.exists():
        return None
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    record=manifest.get(scene["id"],{})
    if record.get("signature")!=voice_signature(scene,doc,model):
        return None
    name=record.get("file")
    if not isinstance(name,str):return None
    candidate=(folder/name).resolve()
    if not candidate.is_relative_to(folder.resolve()):
        raise ValueError("Voice cache path escapes its directory")
    if not candidate.is_file():return None
    path=local_file(folder,name)
    import hashlib
    if hashlib.sha256(path.read_bytes()).hexdigest()!=record.get("sha256"):
        raise ValueError(f"Voice cache checksum mismatch: {path.name}")
    return path


def extract_audio(data):
    blocks=[block for step in data.get("steps",[]) if step.get("type")=="model_output"
            for block in step.get("content",[]) if block.get("type")=="audio"]
    if not blocks:
        raise ValueError("Gemini returned no audio")
    audio=base64.b64decode(blocks[-1]["data"],validate=True)
    if not audio.startswith(b"RIFF"):
        raise ValueError("Expected WAV audio from Gemini")
    return audio


def request_audio(scene,doc,key,model):
    voices=doc.get("voices",DEFAULT_VOICES)
    style=doc.get("voice_style",DEFAULT_STYLE)+" Read only the supplied transcript; no music or effects."
    payload={"model":model,"input":[{"type":"user_input","content":[{"type":"text","text":scene["narration"],
              "annotations":[{"type":"speech_metadata","style":style}]}]}],
             "response_format":{"type":"audio","mime_type":"audio/wav","sample_rate":24000},
             "generation_config":{"speech_config":[{"voice":voices[scene["speaker"]]}]}}
    for attempt in range(3):
        req=urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/interactions",
            data=json.dumps(payload,ensure_ascii=False).encode(),
            headers={"Content-Type":"application/json","x-goog-api-key":key})
        try:
            with urllib.request.urlopen(req,timeout=240) as response:
                return extract_audio(json.load(response))
        except urllib.error.HTTPError as error:
            if error.code in {429,500,502,503,504} and attempt<2:
                time.sleep(5*(attempt+1))
                continue
            # Do not print response bodies, request objects, or credential values.
            raise RuntimeError(f"Gemini TTS HTTP {error.code}; check model availability, key and quota.") from None
        except (TimeoutError,urllib.error.URLError):
            if attempt<2:
                time.sleep(3*(attempt+1))
                continue
            raise RuntimeError("Gemini TTS network request failed") from None


def generate(doc,folder:Path,key_file=None,model=DEFAULT_MODEL):
    missing=[s for s in doc["scenes"] if s.get("narration") and not cached_voice(s,doc,folder,model)]
    if not missing:
        print("Narration cache is current; no API request needed.")
        return
    key=Path(key_file).read_text().strip() if key_file else os.environ.get("GEMINI_API_KEY","").strip()
    if not key:
        raise ValueError("Set GEMINI_API_KEY or pass --key-file with a private local file. Do not paste credentials into chat.")
    folder.mkdir(parents=True,exist_ok=True)
    manifest_path=folder/"manifest.json"
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    import hashlib
    for i,scene in enumerate(missing):
        signature=voice_signature(scene,doc,model)
        audio=request_audio(scene,doc,key,model)
        path=folder/f"{scene['id']}-{signature[:12]}.wav"
        temporary=path.with_suffix(".partial")
        temporary.write_bytes(audio)
        try:
            with wave.open(str(temporary)) as stream:
                if stream.getnframes()==0 or stream.getsampwidth()!=2:
                    raise ValueError("Invalid or empty narration WAV")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        manifest[scene["id"]]={"file":path.name,"signature":signature,"sha256":hashlib.sha256(audio).hexdigest(),
                              "provider":"Google Gemini","model":model,"voice":doc.get("voices",DEFAULT_VOICES)[scene["speaker"]]}
        write_json(manifest_path,manifest)
        print(f"Narration {i+1}/{len(missing)}: {scene['id']}",flush=True)
