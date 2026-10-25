"""Keep Claude's project skill copies identical to canonical .agents skills."""
import argparse
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");args=p.parse_args()
source=ROOT/".agents/skills";target=ROOT/".claude/skills"
expected={file.relative_to(source):file.read_bytes() for file in source.rglob("*") if file.is_file()}
actual={file.relative_to(target):file.read_bytes() for file in target.rglob("*") if file.is_file()}
if args.check:
    if expected!=actual:raise SystemExit("Skill copies differ. Run python scripts/sync_skills.py")
    print("Skill copies match.")
else:
    if target.exists():shutil.rmtree(target)
    shutil.copytree(source,target)
    print("Synced Claude skills from .agents/skills.")
