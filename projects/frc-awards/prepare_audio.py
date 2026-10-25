"""Fit the verified Gemini takes to a five-minute educational edit, preserving pitch."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import wave
from pathlib import Path

from davinci_creator.common import load, write_json
from davinci_creator.tts import cached_voice
from davinci_creator.video import ffmpeg

PROJECT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-seconds", type=float, default=315)
    args = parser.parse_args()
    doc = load(PROJECT / "content.json")
    source = PROJECT / "audio/voices"
    destination = PROJECT / "audio/voices-paced"
    originals = json.loads((source / "manifest.json").read_text())
    takes = []
    for scene in doc["scenes"]:
        path = cached_voice(scene, doc, source)
        if path is None:
            raise SystemExit("Generate the complete Gemini narration before pacing it.")
        with wave.open(str(path)) as stream:
            duration = stream.getnframes() / stream.getframerate()
        takes.append((scene, path, duration))
    original_seconds = sum(t[2] for t in takes)
    speech_budget = args.target_seconds - 1.85 * len(takes)
    if speech_budget <= 0:
        raise SystemExit("Target is too short for the scene transitions.")
    tempo = original_seconds / speech_budget
    if not 0.85 <= tempo <= 1.4:
        raise SystemExit("Timing requires a script revision; refusing excessive time stretching.")
    destination.mkdir(parents=True, exist_ok=True)
    records = {}
    for scene, path, _ in takes:
        output = destination / path.name
        subprocess.run([
            ffmpeg(), "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(path), "-af", f"atempo={tempo:.10f}",
            "-c:a", "pcm_s16le", str(output),
        ], check=True)
        records[scene["id"]] = {
            **originals[scene["id"]],
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "postprocessing": {"filter": "atempo", "factor": tempo, "pitch_preserved": True},
            "original_sha256": originals[scene["id"]]["sha256"],
        }
    write_json(destination / "manifest.json", records)
    report = {
        "original_narration_seconds": original_seconds,
        "target_video_seconds": args.target_seconds,
        "tempo_factor": tempo,
        "pitch_preserved": True,
        "originals_preserved": True,
        "narration_provider": "Google Gemini",
    }
    write_json(PROJECT / "output/pacing-report.json", report)
    print(f"Paced {len(takes)} verified Gemini takes at {tempo:.3f}x for approximately {args.target_seconds:.0f}s.")


if __name__ == "__main__":
    main()
