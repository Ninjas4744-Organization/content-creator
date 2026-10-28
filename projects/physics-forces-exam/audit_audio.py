"""Automated listening QA of the actual soundtrack, using the authorized Gemini account."""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

from davinci_creator.video import ffmpeg
from generate_narration import load_environment

PROJECT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--folder", type=Path, default=PROJECT / "output/video")
    args = parser.parse_args()
    if args.env_file:
        load_environment(args.env_file)
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise SystemExit("Configure GEMINI_API_KEY privately.")
    folder = args.folder / "audio"
    listening = folder / "qa-listening.mp3"
    subprocess.run([
        ffmpeg(), "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(folder / "mix.wav"), "-ac", "1", "-ar", "32000",
        "-c:a", "libmp3lame", "-b:a", "80k", str(listening),
    ], check=True)
    prompt = (
        "Listen to the entire attached Hebrew school physics lesson soundtrack. "
        "Audit what is actually audible. Return JSON only: language, distinct_narrator_voices, "
        "voice_descriptions, speech_intelligibility_1_to_5, pace_assessment, "
        "background_music_present, music_masks_speech, cutoffs_repetitions_or_missing_words, "
        "pronunciation_issues_with_timestamps, audible_content_summary, physics_concept_errors, "
        "overall_pass. Two alternating synthetic voices should be clear, warm and easy to learn from. "
        "The lesson should explain forces, spring force and a Hooke experiment, operational measured "
        "weight versus gravity, vector sums, inertia, Newton third law, tension, two-body systems, "
        "normal force, static friction and its experiment, and precise symbol meanings and SI units at first use. "
        "The extended review includes force components, sine/cosine, the Pythagorean and tangent identities, "
        "and complementary angles. Three worked examples should be audible: a 5 kg body on two ropes at "
        "30 and 60 degrees (tensions 25 N and about 43.3 N); a 3 kg body on a 30 degree incline with "
        "static coefficient 0.5 (normal about 25.98 N, required friction 15 N above the 12.99 N maximum, "
        "critical angle about 26.6 degrees); and a 2 kg box pulled with 8 N upward at 30 degrees with "
        "coefficient 0.5 (normal 16 N, friction about 6.93 N, maximum allowed pull about 8.96 N). "
        "Compare these expected results with what is actually spoken; do not assume they were spoken correctly. "
        "In this Israeli textbook measured weight means the force on a weighing instrument, "
        "so free-fall measured weight zero with nonzero gravity is intentional. "
        "Kinetic friction is out of scope. Flag genuine audible errors, not imagined omissions. "
        "This is an automated audio audit, not a human listening review."
    )
    payload = {"model": "gemini-3.8-flash", "input": [
        {"type": "text", "text": prompt},
        {"type": "audio", "mime_type": "audio/mp3", "data": base64.b64encode(listening.read_bytes()).decode()},
    ]}
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Listening audit HTTP {error.code}; no credential data logged.") from None
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit("Listening audit transport failed.") from None
    answer = "\n".join(
        block.get("text", "") for step in result.get("steps", [])
        if step.get("type") == "model_output" for block in step.get("content", [])
        if block.get("type") == "text"
    ).strip()
    if not answer:
        raise SystemExit("Listening audit returned no text.")
    (folder / "listening-audit.txt").write_text(answer + "\n", encoding="utf-8")
    print(answer)


if __name__ == "__main__":
    main()
