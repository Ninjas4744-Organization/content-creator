# Prepare the local creator environment

Work from the kit root. Install missing Python and required local tools yourself as part of the requested creation, publication or kit update, then continue the task. Do not stop at telling the creator to install them manually. Reuse working installations and install only what the requested workflow needs. Use the execution environment's approval mechanism when required; if installation is blocked by permissions, network access or an interactive system prompt, report the specific blocker and the minimum action needed.

## Find or install Python

Check the kit's `.venv` interpreter first, then `python3`, `python` and, on Windows, `py -3`. Actually run each candidate; a command name or Windows Store alias does not prove Python is installed. A suitable interpreter must pass:

```sh
<python> -c "import sys; assert sys.version_info >= (3, 10); print(sys.executable)"
```

Here and below, replace `<python>` with the working interpreter command or its quoted absolute path. In PowerShell, use `&` before a quoted executable path. Do not assume `python3` or a newly installed command is already on the current process's PATH.

If no suitable interpreter works, choose the available installation method for this computer:

- With `uv` already installed, run `uv python install 3.12`, then obtain the executable with `uv python find --system 3.12`. See [uv's Python installation guide](https://docs.astral.sh/uv/guides/install-python/).
- On macOS with Homebrew, run `brew install python@3.12` and use the interpreter under the prefix printed by `brew --prefix python@3.12`, at `bin/python3.12`. See the [Homebrew formula](https://formulae.brew.sh/formula/python@3.12).
- On Windows with WinGet, run `winget install --exact --id Python.Python.3.12 --source winget --scope user`. Locate and verify the installed executable, using `py -3.12` if available. See [WinGet installation options](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).
- On Debian/Ubuntu, use the system package manager to install `python3`, `python3-venv` and `python3-pip`, then check the interpreter version again. Other Linux distributions use their corresponding packages. Use an available user-local installation if system package installation needs unavailable privileges or provides Python older than 3.10.

If none of these methods is available, install `uv` for the current user with its [official standalone installer](https://docs.astral.sh/uv/getting-started/installation/), then use its Python installation commands above. Download the installer to a temporary file and run it, using the installed executable's full path if needed. This fallback does not require an existing Python installation. Keep existing system Python installations intact.

## Prepare or repair the kit environment

For a kit update, the verified Python interpreter can run `scripts/creator_agent.py update` directly with the standard library, even when `.venv` is absent. Fetch the update first, then follow the updated setup instructions to align the rendering environment.

For creation or publication, check an existing environment with:

```sh
.venv/bin/python -m pip check
.venv/bin/python -m davinci_creator doctor
```

On Windows, use `.venv\Scripts\python.exe` in place of `.venv/bin/python` throughout the skills and command examples. If the environment is absent, either check fails, or the kit has just been updated, run:

```sh
<python> scripts/setup.py
```

The bundled setup creates `.venv`, installs the dependencies declared in `pyproject.toml` and runs `doctor`. If it fails because `venv`, `ensurepip` or pip is missing, install the matching OS package or use a uv-managed Python, then retry setup. For missing pip in an otherwise working `.venv`, use that environment's interpreter with `-m ensurepip --upgrade`. If an existing `.venv` cannot run or uses an unsupported Python, preserve it under an unused backup name before recreating it with the verified interpreter. Install Python packages only in the kit environment and preserve the dependency ranges in `pyproject.toml`.

`doctor` checks the supplied fonts, brand images and FFmpeg. The declared `imageio-ffmpeg` dependency normally supplies FFmpeg; verify that before installing a system copy. If this platform needs a separate FFmpeg binary, install it with the available package manager and set `FFMPEG_PATH` for the task. Repair other missing tools only when the requested operation needs them. Do not install optional storage integrations, cloudflared, or paid AI services as part of local setup. Narration credentials are configured separately through the video skill.

After setup or repair, rerun both checks above and continue the original task with the kit's interpreter. Report a concrete remaining failure if either check still fails; do not claim the environment is ready based only on a successful download or install command.
