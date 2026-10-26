# SCORM 1.2 export

Export a lesson as one self-contained SCO for a compatible learning platform. Slides use an embedded slide canvas. Videos use a dedicated, direct video player with chapters, speed and captions. Each package has one lesson heading and one final knowledge check. Public players keep their practice checkpoints; those checkpoints are omitted from SCORM exports.

## Export from the command line

From the repository root, after Python setup:

```sh
.venv/bin/python -m davinci_creator scorm examples/community/content.json --out projects/scorm-pilot/output/slides
.venv/bin/python -m davinci_creator scorm examples/community/approved-timeline.json --format video --video examples/community/approved-video.mp4 --out projects/scorm-pilot/output/video
```

Upload `lesson.zip` from the selected output directory. For another lesson use its `content.json` for slides, or its rendered `timeline.json` and matching MP4 for video. Rebuilding replaces only `lesson.zip`; a failed build preserves the previous archive.

Options: `--pass-score 0.8`, `--coverage 0.9`, `--format slides|video`, and `--video path/to/video.mp4`. A valid mastery score supplied by the LMS overrides the package passing score.

## Completion and resume

Slides require a visit to every slide; videos require the configured viewing coverage. All source questions appear once, in the final knowledge check. Every question needs an answer before submission. A lesson without questions receives 100 once viewing is complete and the learner submits.

The package reports a 0–100 score, explicit `passed` or `failed`, session time and choice interactions. Question IDs `q1`, `q2`, etc. follow source order. Exports support up to 250 questions and 36 options per question.

Before submission it reports `incomplete` with `exit=suspend`. Compact `cmi.suspend_data` stores location, viewed slides/video coverage and answers within the SCORM 1.2 4096-character limit. State belongs to the LMS attempt. Public-player localStorage is not used. A new attempt starts fresh, and a fingerprint prevents incompatible content revisions from restoring old progress.

Video coverage uses 512 timeline bins and actual playback time/rate. Seeking does not count, and repeated intervals are not added twice. Coverage is approximate, with resolution of about 0.2% of video duration. The HTML includes client-side scoring logic and answer keys; use these exports for training checks rather than secure examinations.

Progress is committed every 10 seconds, on answer changes, on tab hiding and through the save button. Closing calls `LMSFinish`. Submission fixes the result and finishes the session. An API error offers a retry of that fixed result. Terminal relaunches and review mode preserve the prior result. Another try needs a new attempt under the LMS's rules.

A successful API return confirms handoff to the LMS runtime. Verify server persistence in the LMS's own report.

## Configure the assignment

Upload the ZIP as SCORM content, then assign it to the desired course/audience. Enable progress saving if the LMS offers this setting. Choose a completion rule that processes the content's result on `LMSFinish`; avoid completion on launch when viewing or a knowledge check is required. Set the passing score and retry policy. Video packages must fit the installation's upload limit.

## Verification

```sh
.venv/bin/python -m unittest discover -s tests -p test_scorm.py -v
node tests/scorm_runtime.test.cjs
.venv/bin/python scripts/scorm_demo.py projects/scorm-pilot/output/video/lesson.zip
```

Open `http://127.0.0.1:8770/`. The independent SCORM emulator stores simulated attempts locally. Refresh to resume; **ביצוע חדש** starts fresh. It listens only on loopback, uses no credentials and sends no results to a real learning platform.

In the target LMS verify import, suspend/relaunch, passing and failing scores, question responses, time, new attempts, review, Hebrew layout, mobile playback and the LMS's own close/back controls.

References: [SCORM 1.2 conformance requirements](https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_ConformanceReq.pdf), [SCORM 1.2 addendums](https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_Addendums.pdf).
