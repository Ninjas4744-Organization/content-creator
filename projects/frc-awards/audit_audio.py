"""Ask Gemini to listen to the completed mix; no credentials are persisted or printed."""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def main():
    project = Path(__file__).resolve().parent
    folder = project / "output/video"
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise SystemExit("Set GEMINI_API_KEY privately in the process environment.")
    prompt = (
        "Listen to the entire attached Hebrew educational video soundtrack. "
        "Audit what is audible, independently of the expected script. "
        "Return JSON only with keys: language, distinct_narrator_voices, "
        "voice_descriptions, background_music_present, speech_intelligibility_1_to_5, "
        "music_masks_speech, pace_assessment, cutoffs_or_repetitions, "
        "content_summary, audible_questions, concerns_with_timestamps, overall_pass. "
        "The target is two distinct synthetic narrators, clear Israeli Hebrew, "
        "quiet music, understandable explanations of FRC awards, and two viewer questions. "
        "List genuine pronunciation or comprehension problems, without inventing concerns. "
        "Do not infer speaker identities. This is an automated listening audit, not human review."
    )
    payload = {
        "model": "gemini-3.8-flash",
        "input": [
            {"type": "text", "text": prompt},
            {"type": "audio", "mime_type": "audio/mp3", "data": base64.b64encode((folder / "audio/qa-listening.mp3").read_bytes()).decode()},
        ],
    }
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Gemini listening audit HTTP {error.code}; no credential data logged.") from None
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit("Gemini listening audit transport failed.") from None
    text = "\n".join(
        block.get("text", "") for step in result.get("steps", [])
        if step.get("type") == "model_output" for block in step.get("content", [])
        if block.get("type") == "text"
    ).strip()
    if not text:
        raise SystemExit("Gemini listening audit returned no text.")
    (folder / "audio/gemini-listening-audit.txt").write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
