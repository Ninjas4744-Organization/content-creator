"""Prepare a verified player package that fits the existing Cloudflare media limit."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

from davinci_creator.video import ffmpeg
from build_video import add_player_resources

PROJECT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", type=Path, default=PROJECT / "output/revision-2")
    parser.add_argument("--maximum-mib", type=float, default=24.5)
    args = parser.parse_args()
    folder = args.folder
    source = folder / "video.mp4"
    if not source.is_file():
        raise SystemExit("Render the complete narrated MP4 first.")
    limit = int(args.maximum_mib * 1024 * 1024)
    before = source.stat().st_size
    encoding = None
    if before > limit:
        candidate = folder / "build/web-delivery.partial.mp4"
        for quality, bitrate in [(23, "128k"), (25, "112k")]:
            subprocess.run([
                ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium",
                "-threads", "4", "-crf", str(quality), "-pix_fmt", "yuv420p", "-c:a", "aac",
                "-b:a", bitrate, "-movflags", "+faststart", str(candidate),
            ], check=True)
            if candidate.stat().st_size <= limit:
                encoding = {"video_crf": quality, "audio_bitrate": bitrate, "resolution_preserved": True}
                break
        else:
            candidate.unlink(missing_ok=True)
            raise SystemExit("The candidate still exceeds the publishing limit; the original MP4 is preserved.")
        subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", str(candidate), "-f", "null", "-"], check=True)
        master = folder / "build/master-before-web-encoding.mp4"
        if master.exists():
            raise SystemExit("A preserved master already exists; inspect before replacing it.")
        source.replace(master)
        candidate.replace(source)
    subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", str(source), "-f", "null", "-"], check=True)
    shutil.copy2(source, folder / "interactive/video.mp4")
    doc = json.loads((PROJECT / "content.json").read_text())
    add_player_resources(doc, folder)
    archive = shutil.make_archive(str(folder / "physics-forces-exam-interactive"), "zip", root_dir=folder / "interactive")
    report = {
        "source_bytes": before, "delivery_bytes": source.stat().st_size,
        "maximum_bytes": limit, "encoding": encoding,
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "full_decode_passed": True, "interactive_archive": Path(archive).name,
        "includes_symbol_glossary": (folder / "interactive/symbols.html").is_file(),
    }
    (folder / "delivery-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
