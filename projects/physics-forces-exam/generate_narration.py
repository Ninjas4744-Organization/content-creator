"""Generate Gemini narration; load only GEMINI_API_KEY from an authorized private file."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shlex

from davinci_creator.tts import generate

PROJECT = Path(__file__).resolve().parent


def load_environment(path: Path):
    """Load the one authorized key into this process; never persist or print it."""
    for raw in path.read_text(encoding="utf-8").splitlines():
        name, separator, value = raw.strip().removeprefix("export ").partition("=")
        if separator and name.strip() == "GEMINI_API_KEY":
            values = shlex.split(value, comments=True)
            if values and values[0].strip():
                os.environ["GEMINI_API_KEY"] = values[0].strip()
                return
            break
    raise SystemExit("GEMINI_API_KEY is missing from the authorized private file.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--key-file", type=Path)
    args = parser.parse_args()
    if args.env_file and args.key_file:
        parser.error("Choose one private credential source.")
    if args.env_file:
        load_environment(args.env_file)
    try:
        # Narration can start while the independently generated diagram assets render.
        doc = json.loads((PROJECT / "content.json").read_text(encoding="utf-8"))
        generate(doc, PROJECT / "audio/voices", key_file=args.key_file)
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from None


if __name__ == "__main__":
    main()
