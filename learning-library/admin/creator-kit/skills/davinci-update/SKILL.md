---
name: davinci-update
description: Update the downloaded Da Vinci 4744 creator skills, Python tools and supplied assets from the admin website, preserving local projects and edits. Use when the creator asks to update or repair their creator kit.
---

# Update the creator kit

From the kit root, run `.venv/bin/python scripts/creator_agent.py update` (Windows: `.venv\Scripts\python.exe`). Python 3.10+ can run this helper without installing the rendering dependencies. The user signs in through the site's learning-platform login and approves the agent in the browser when needed. No `cloudflared` installation is required. Do not print or copy the private local login file or its token.

The helper downloads the current kit from the protected admin, verifies the archive and every managed file, and checks all destinations before changing them. Projects, outputs, credentials and custom project assets are outside the update. Unmodified managed files may be replaced or removed. Locally modified managed files stop the update before any changes; preserve those edits and compare them with a freshly downloaded kit instead of forcing replacement.

After a successful update run `python3 scripts/setup.py` to align the local environment, then reload the agent's workspace/skills if it caches them. Read the updated creation/publishing skill before using it. Report the installed kit version. An update never publishes content or changes the creator's global agent settings.
