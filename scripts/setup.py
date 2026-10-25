"""Cross-platform local setup. Does not edit global app settings."""
import os
from pathlib import Path
import subprocess
import sys
import venv

ROOT=Path(__file__).resolve().parents[1]
if sys.version_info<(3,10):raise SystemExit("Python 3.10 or newer is required")
folder=ROOT/".venv"
if not folder.exists():venv.EnvBuilder(with_pip=True).create(folder)
python=folder/("Scripts/python.exe" if os.name=="nt" else "bin/python")
subprocess.run([str(python),"-m","pip","install","-e",str(ROOT)],check=True)
subprocess.run([str(python),"-m","davinci_creator","doctor"],check=True)
print("Ready. Use .venv/bin/python (macOS/Linux) or .venv\\Scripts\\python.exe (Windows).")
