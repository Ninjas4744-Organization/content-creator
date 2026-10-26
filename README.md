# Da Vinci · Presentations Creator

Create Hebrew presentations and explainer videos with Da Vinci 4744 branding. Open this repository in an assistant with local file access and describe what you want to create. The skills, backgrounds, logos, fonts, examples, and export tools are included.

![Da Vinci branding example](examples/community/poster.jpg)

## Start with a conversation

After cloning, open the repository's **root folder** as a local project in ChatGPT/Codex or Claude Code. For example:

> Create a 10-slide Hebrew presentation about recruiting sponsors for a FIRST team. The audience is a new team, and the training should take 20 minutes. Use the presentation skill and the branding in this repository, and export both PowerPoint and browser slides.

Or:

> Create an interactive Hebrew explainer video about our community activities, approximately two minutes long, with male and female Gemini narrators, music, animation, and two questions for the viewer. Use the video skill in this repository.

To explore immediately without installing anything, open the [browser presentation](examples/community/presentation.html), [PowerPoint example](examples/community/presentation.pptx), or [video with chapters and questions](examples/community/interactive/index.html). The included player links to the video elsewhere in the example folder; copy the entire example folder when sharing it.

The assistant reads `AGENTS.md` and the relevant skill. In Claude Code, you can also invoke `/davinci-presentation` or `/davinci-interactive-video`. See the [application guide](docs/apps.md) for app-specific instructions and limitations. A chat without local folder access needs uploaded files or a suitable coding environment; cloning the repository on your computer does not by itself give a chat access to it.

## Learning library website

An Expo website under `projects/learning-library/` brings the presentations and interactive videos together in a responsive Hebrew library. It includes topic and format filters, chapter search, embedded viewing, shareable links, and PowerPoint downloads.

After Python setup, run `npm ci` and `npm start` in that directory. `npm run build` exports the website to `projects/learning-library/output/site/`. GitHub Actions checks the project and deploys the public library and LTI service to Cloudflare at [knowledge.davinci4744.com](https://knowledge.davinci4744.com/). See the [library guide](docs/gallery.md) for adding content and retaining videos for publication.

The library is open for everyone to browse and use. It also offers an optional **LTI 1.3 integration**: instructors select lessons for their courses, and learners submit scores and completion to their learning platform. Public browsing and LTI use the same website. A Python service is also available for local use and conventional server hosting. See the [LTI setup guide](docs/lti.md) for supported reporting, registration and verification.

For installation inside a learning platform, export a lesson as a self-contained **SCORM 1.2 ZIP**. Slides and interactive videos support a final knowledge check, scores, completion and progress saved in the LMS. See the [SCORM export guide](docs/scorm.md) and [pilot brief](projects/scorm-pilot/brief.md).

The [Cloudflare deployment guide](docs/cloudflare.md) covers Workers, D1 and GitHub Actions credentials. The retired `learn.davinci4744.com` hostname redirects public bookmarks; all LTI connections use `knowledge.davinci4744.com`. The current videos fit static hosting, so R2 is optional.

## First-time setup

Python 3.10 or newer is required. Installing dependencies requires an internet connection the first time. The tools are designed for macOS, Linux, and Windows; this repository was tested on macOS.

```sh
python3 scripts/setup.py
```

On Windows, run `py scripts/setup.py`. No global assistant settings need to change. After setup, use `.venv/bin/python`; on Windows, replace it with `.venv\Scripts\python.exe`.

Try the example presentation without an external account or API key:

```sh
.venv/bin/python -m davinci_creator deck examples/community/content.json --out outputs/community-deck
```

Open `outputs/community-deck/presentation.html`, or edit `presentation.pptx`. Install the included Rubik fonts on any other computer used to present the PowerPoint file. The [command guide](docs/commands.md) also covers creating projects, rendering videos, and running checks.

## What's included

- **Two skills** for creating presentations and interactive videos, with local copies for Codex and Claude Code.
- **Brand assets**: backgrounds, emblem, team name and number, wordmark, two Rubik font weights and their license, team and robot photos, and the visual reference document.
- **Presentations**: PowerPoint with editable text, self-contained HTML slides, speaker notes, and visual previews.
- **Videos**: Python animation and transitions, original music and sound effects generated in code, automatic music ducking during speech, Gemini narration using Kore and Puck, and Hebrew captions.
- **Interactive player**: chapters, transcript search, playback speed, locally saved progress, and questions with feedback. The MP4 provides continuous playback; the HTML player adds interactivity.
- **Ready-to-use example**: Introduction to Community in FIRST, including the approved video and its cached narration. You can build the example without sending a request to Gemini.

## Generate new narration

Only new narration requires a Gemini API key and access to a supported TTS model in your account. Set `GEMINI_API_KEY` in your environment, or pass `--key-file` with the path to a private file. Do not paste keys into chat or store them in the repository. `.env.example` documents variable names only; the tool does not automatically load `.env`.

```sh
.venv/bin/python -m davinci_creator tts projects/my-training/content.json
.venv/bin/python -m davinci_creator video projects/my-training/content.json --out projects/my-training/output/video
```

Narration is cached by transcript, voice, model, and delivery style. Changing any of these requires new narration. See the [official Gemini documentation](https://ai.google.dev/gemini-api/docs/speech-generation) for the speech engine and available models.

## Edit and share

Each project has a `brief.md` and `content.json` under `projects/`. Edit the content through your assistant or manually, then export again. The [content format](docs/content-format.md) and [brand guide](docs/brand.md) explain the available options.

To share a generated player, keep its entire `interactive/` folder together. Open `index.html`; if the browser restricts local captions or media, use the `serve` command in the command guide. Standalone players use no external service and send no viewing data. In LTI mode, the library records progress and reports the submitted result to the learner's course.

Generated working outputs, virtual environments, and API keys are excluded from Git. Intentionally retained gallery videos under `projects/learning-library/output/published/` are included so that the deployment workflow can publish them. [Asset sources and rights](assets/README.md) are documented alongside the files.
