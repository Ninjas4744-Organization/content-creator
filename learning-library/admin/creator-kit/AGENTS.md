# Da Vinci 4744 creator kit

This folder is a standalone workspace downloaded from the library admin. Work from this root. No Git account or checkout is required.

- Presentations: read `.agents/skills/davinci-presentation/SKILL.md`.
- Interactive videos: read `.agents/skills/davinci-interactive-video/SKILL.md`.
- Uploading, publication or restoring editable sources: read `.agents/skills/davinci-publish/SKILL.md`.
- Updating these skills/tools: read `.agents/skills/davinci-update/SKILL.md`.
- Brand and content schema: `docs/brand.md` and `docs/content-format.md`.
- Use local Rubik fonts and supplied logos; Hebrew uses logical RTL. Preserve Gracious Professionalism®.
- Create and edit under `projects/<id>/`. Run `python3 scripts/setup.py` if `.venv` is absent. Use the project's Python environment for rendering.
- Retain local sources and output previews. Publication includes a private recoverable source archive. Restore with `scripts/creator_agent.py pull <id>`; local changes are never overwritten.
- All website operations use `scripts/creator_agent.py` and the creator's learning-platform login with browser approval. No cloudflared is needed. Do not use legacy Wrangler/S3 instructions in reference docs. Do not ask for Git access, Cloudflare API keys, storage credentials or admin service tokens.
- Never put credentials in a project or generated output. Narration credentials belong in an environment variable or private file. The kit never supplies or updates them.
- Create requested drafts autonomously. Publish only when requested, after reviewing the actual generated output. Preserve other catalog entries and stop on revision conflicts.
