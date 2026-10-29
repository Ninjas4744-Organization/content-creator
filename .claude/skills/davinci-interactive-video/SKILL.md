---
name: davinci-interactive-video
description: "Create or revise an animated Hebrew explainer video or interactive training video for Da Vinci 4744. Use for סרטון, אנימציה, קריינות, interactive video, chapters, quizzes, background music or Gemini TTS requests. Produces MP4, captions and an offline interactive HTML player with chapters and learning checkpoints."
---

# Create an animated and interactive explainer

Work from the repository root, three directories above this file. Read `docs/brand.md`, `docs/content-format.md` and the video commands in `docs/commands.md` as needed.

`projects/` is a local workspace excluded from Git. Restore missing existing sources with `.venv/bin/python scripts/project_store.py pull <name>` before editing. Save completed source changes with `project_store.py push <name>` when saving the requested work. The source archive includes project assets and scripts, while rendered outputs and narration caches remain local or in their published R2 release. See `docs/project-sources.md`.

1. Infer the topic, audience, outcome and length from the user's brief. Create `projects/<name>/` using the `new` command if needed. Reuse an existing presentation's `content.json` when adapting it into a video; simplify visible text and write a spoken explanation rather than reading slide bullets verbatim.
2. Write a scene sequence with a hook, clear explanation, visual examples and a useful next step. Every scene has a short visual title, layout, optional items/photo, Hebrew `narration` and `speaker` set to `female` or `male`. Alternate Kore and Puck unless the user prefers otherwise. Keep the narration natural and pronounceable. Preserve Gracious Professionalism® in visible text; the spoken transcript need not read the symbol.
3. Add meaningful optional `quiz` objects to selected scenes. Interactive HTML supports chapter jumping, transcript search, playback speed, resumable progress and optional pauses for questions. A plain MP4 is the linear version of the same story.
4. Produce a quick visual draft with `.venv/bin/python -m davinci_creator video projects/<name>/content.json --out projects/<name>/output/draft --draft --seconds 4 --width 640 --fps 12`. This includes animation, original music and effects, and visibly labels the absence of narration. Review representative frames before a full render.
5. For new narration, use Gemini TTS via `.venv/bin/python -m davinci_creator tts projects/<name>/content.json`. Read credentials only from `GEMINI_API_KEY` or `--key-file <private-local-path>`. Do not ask the user to paste keys into chat, copy keys into source files, or log them. If credentials are missing, finish the draft and request the environment variable or file path. Do not silently substitute another speech engine.
6. Render with `.venv/bin/python -m davinci_creator video projects/<name>/content.json --out projects/<name>/output/video`. The renderer uses cached, content-verified WAVs, animated entrances, moving particles, crossfades, original synthesized music/SFX and speech ducking. It exports MP4, approximate phrase captions, audio report, storyboard and interactive player. Use `--width 1920` for a 1080p export when appropriate.
7. Inspect the output: decode the MP4 fully, view representative scenes, listen to both voices and check speech/music balance. Confirm no clipping in the audio report. Open the interactive player, test chapters, search and a checkpoint. Fix issues and rerender affected outputs. Captions use proportional phrase timing; refine timings if word-accurate captions are required.
8. Deliver MP4 and interactive-player links. Keep the full `interactive/` folder together for sharing. Include the content source and explain any missing narration or unverified playback.

`examples/community/voices/` contains the previously generated Gemini narration for the community example. Pass `--voices examples/community/voices` to reuse it offline. A changed transcript, voice, style or model invalidates its cache signature. The approved video in that example is the earlier hand-tuned render; generic new builds follow the reusable layouts. Never present a silent draft as a finished narrated video.

For real team photos, consult `assets/photo-albums.json` and `docs/photos.md`. Browse with `photos catalog <album-id>`, import selected photos with `photos import <album-id> --photo-id <id>` (repeat as needed), and use the manifest's local `image` paths in scenes. Preserve source records and select images that support the narration; album titles do not establish accomplishments or identities.
