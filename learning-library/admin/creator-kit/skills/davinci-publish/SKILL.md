---
name: davinci-publish
description: Publish or update a Da Vinci 4744 presentation or interactive video in the learning library using the creator's admin login. Use when the user asks to upload or publish finished learning content.
---

# Publish learning content

Work from the creator-kit root, three directories above this skill. The kit includes the Python creator, supplied brand assets and creation skills. It needs no Git checkout, Wrangler login or Cloudflare storage keys.

Before running any Python command, follow `docs/setup.md` from the kit root. Detect and install missing Python and required local dependencies yourself, verify the kit environment, then continue. Use `.venv/bin/python` on macOS/Linux or `.venv\Scripts\python.exe` on Windows.

`scripts/creator_agent.py` opens the site's browser login when needed. Let the creator sign in through their learning-platform account and approve the agent. No `cloudflared` installation is needed. Login is retained in a private file outside projects; never display or copy it. An expired or revoked grant requires fresh browser approval. The creator can revoke agents from **החשבון שלי** in the admin, or disconnect this computer with `scripts/creator_agent.py disconnect`.

- For creation or revisions, use `davinci-presentation` or `davinci-interactive-video`. Use `davinci-import` to restore missing sources before updating a published item.
- Load saved libraries with `scripts/creator_agent.py catalog`. For new content, choose the requested library ID; `none` means direct-link access. Record title, description and category in `projects/<id>/publication.json`. Use stable lowercase project IDs. Existing items retain their current library and editorial metadata; change those in the admin.
- Verify the storyboard and the actual exported presentation/player. Review narrated video and audio before publishing. Never publish a silent draft as a completed narrated video.
- When publication is requested, run `.venv/bin/python scripts/creator_agent.py publish <id> --gallery <id>`. For a rendered video add `--video projects/<id>/output/video/interactive`. The helper rebuilds the publication package, uploads media in verified chunks and retains private editable sources. Only after all files exist does it conditionally update the shared catalog. Other items and unknown metadata are preserved.
- Interrupted uploads retain a recovery directory. Run `scripts/creator_agent.py resume <directory>` to continue. If the catalog or published sources changed, compare the latest sources, item and library metadata before deliberately preparing a new publication; do not blindly retry a conflict. Republishing an existing ID requires the source marker from a pull or successful publication. If absent or outdated, pull into a separate kit folder and merge local edits there.
- To send a published SCORM package to Blossom, use its upload button in the site admin. The row displays the Blossom Content ID after a successful transfer.
- Verify the result in the admin and open its saved library link. Publication is visible on the site's next load. Report the item ID, destination and any verification limits. Local content creation alone does not authorize publication.

New narration still needs the creator's own Gemini credential through an environment variable or private file, as described in the video skill. Admin access authorizes publication, not paid AI services.
