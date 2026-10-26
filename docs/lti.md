# Learning library LTI integration

The library is open for everyone to browse, watch and share without an LMS account. It also offers an optional LTI 1.3 connection: instructors choose a presentation or video for a course through Deep Linking, and learners submit scores and completion to that course through Basic Outcomes.

Public access and course reporting are separate entry points to the same published lessons. Ordinary website visits do not create LMS sessions or report scores. A shared lesson link opens the public viewer; a signed course launch enables reporting for that course.

The existing GitHub Pages export and offline players still work on their own. LTI needs the Python service on an HTTPS origin. GitHub Pages cannot run this service. The service serves the exported website and media from the same origin, so no CORS configuration or shared cookies are needed.

For serverless hosting, use the [Cloudflare deployment](cloudflare.md). It uses a Worker and D1, serves the same public library, and preserves the current LTI compatibility. The Python setup below remains available for local use and conventional server hosting.

## Install and build

From the repository root, with Python 3.10 or newer:

```sh
python3 scripts/setup.py
.venv/bin/python -m pip install -e '.[lti]'
```

From `projects/learning-library/`:

```sh
npm ci
npm run build
```

Build for the origin root: leave `EXPO_BASE_URL` unset for this deployment. A separate GitHub Pages deployment can still use its own base path.

## Configure the tool

Copy `projects/learning-library/lti.example.json` to `projects/learning-library/lti.local.json`. Set:

- `tool_url`: the library service's HTTPS origin, without a trailing slash or path prefix.
- `platform_issuer`: the LMS **issuer ID URL**, copied exactly from its LTI registration form. It may include an installation path.
- `client_id`: the same unique client ID in both registrations.
- `deployment_id`: the deployment ID configured in the LMS; the current connection uses `na`.
- `pass_score`: the passing fraction, from `0` to `1`; default `0.8`.

File paths resolve relative to the JSON configuration file. `source_root` is the content-creator repository root. Keep the source documents available to the service so it can load questions and calculate scores. Do not serve that directory publicly.

Generate a signing key once, from the repository root:

```sh
.venv/bin/python -m davinci_creator lti-keygen --out projects/learning-library/output/lti/tool.private.pem
```

The command refuses to overwrite a key. Keep this key across service restarts and deployments. A changed key requires an update to the LMS registration. Key files, the local config and SQLite state are ignored by Git. Protect and back up the key and database; restrict the containing directory to the service account. The service refuses to put its key or database under `site_dir`.

## Register in the learning platform

Create an **LTI 1.3 provider**. For a tool hosted at `https://learning.example.org`, use:

| Provider field | Value |
| --- | --- |
| Default target link URL | `https://learning.example.org/lti/resource` |
| Deep link URL | `https://learning.example.org/lti/resource` |
| Client ID | The configured `client_id` |
| Open ID connection initiation URL | `https://learning.example.org/lti/login` |
| Public keyset URL | `https://learning.example.org/lti/jwks` |

Both launch types return to `/lti/launch`; the signed message determines whether the library shows lesson selection or an assigned lesson. Set both the default target and Deep Linking URLs to `/lti/resource` as shown above.

The current connection profile derives these platform endpoints from the configured issuer. It requires Basic Outcomes result tokens with a signed attempt identifier. Other LMS platforms may need an adapter for their endpoint and result-token formats.

| Purpose | Platform path |
| --- | --- |
| Authorization | `/WebServices/lti13/auth` |
| Platform public keys | `/WebServices/lti13/jwk` |
| Service token | `/WebServices/lti13/oauth2_token` |
| Results | `/WebServices/lti13/basic_outcome?tp_id=…` |
| Lesson selection return | `/WebServices/lti13/lti_deep_linking_response?tp_id=…` |

Create an LTI content item and choose this provider. Use its lesson selection action, open a presentation or video in the library, then choose **הוספת השיעור לקורס**. Selection returns one `ltiResourceLink` with the selected format fixed in its launch URL. You can also enter that lesson URL manually if needed.

**Enable “wait for score reporting from provider” on the content item** (`lesson_options[outcome]`). Without that option, the current platform completes the attempt on launch and does not provide a result identifier. The library shows a reporting-unavailable message for such previews. Assign the content to the course audience as usual.

## Run

From the repository root:

```sh
.venv/bin/python -m davinci_creator lti-serve --config projects/learning-library/lti.local.json --port 8000
```

This uses Waitress. Put an HTTPS reverse proxy in front of `127.0.0.1:8000`, forwarding all paths on the configured tool origin. The public URLs come from the config, not forwarded request headers. `/health` returns a basic health check. Keep the SQLite file on persistent local storage shared by this service's workers; this implementation is intended for a single host, not independent replicas.

Alternatively, set `DAVINCI_LTI_CONFIG` to an absolute config path and use the WSGI factory `davinci_creator.lti.app:create_app`. The service validates the build and key at startup. Ordinary static export does not import or require the LTI dependencies.

Deploy the source documents and exported site together. Restart the service after a content rebuild. Existing attempts retain their question snapshot; use a new content item or attempt for a materially revised lesson.

The browser stores a separate secret for each login flow in `sessionStorage`. The service checks it after validating the LMS's signed launch. This binds the launch to the initiating browser without relying on third-party cookies. If a browser blocks embedded storage entirely, configure the provider to open in a separate window. Do not add the bearer token to a URL.

## Completion and scores

- A presentation requires a visit to every slide.
- A video requires at least **90% viewing coverage**. Playback events are checked against server time and the supported playback rate. Jumping to the end does not complete it. Rewatching the same interval does not add duplicate coverage.
- All source-document quiz questions appear in a final knowledge check for both formats. The in-video checkpoints remain practice questions. All final questions must have an answer.
- The service calculates `correct answers / total questions`. A lesson with no questions reports `1.0` once its viewing requirement is met. Quiz answers are saved before submission and locked after submission.
- A score at or above `pass_score` reports `Yes`. A lower score reports `Scorm_fail`. These are completion values in the current platform's compatibility extension; the lesson remains an HTML presentation or interactive video.
- Submitting a result is explicit. HTTP success alone is insufficient: the service also requires a successful Basic Outcomes XML response. A failed delivery preserves the fixed result and offers a retry. Repeating a successful submission sends no second result.
- Relaunching the same attempt restores its progress and result. The current platform refreshes the timestamp in its headerless result token on each launch. After verifying the enclosing launch JWT, the tool reads its `pid` for a stable attempt identity and retains the latest complete token for reporting. A new platform attempt starts with no progress. The tool stores a hash of the learner/registration/resource/attempt identity and the opaque result identifier; it does not retain names, email addresses or the complete launch token.

Basic Outcomes provides one final numeric result. The library keeps detailed slide/video progress itself and sends the submitted result to the LMS. The current service does not implement AGS or NRPS and does not claim LTI Advantage certification. Public training exports contain practice answer keys, so this is suitable for training checks rather than secure examinations.

The service permits only the configured platform's callback paths, validates RS256 signatures and issuer/client/deployment/nonce/state, and consumes each launch flow once. Selection requires an instructor role. Expired flow, exchange, session and attempt records are removed during subsequent logins; `retention_days` controls attempt retention. Protect state backups with the same access rules as the database.

## Verification

From the repository root:

```sh
.venv/bin/python -m unittest discover -s tests -v
```

From `projects/learning-library/`:

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

The Python suite uses a protocol emulator for the current LMS connection. It verifies selection JWTs, the expected issuer audience for service tokens, XML scores/completion, browser binding, invalid signatures and callbacks, replay rejection, persisted progress and safe retries. It also checks that public browsing and shared lessons work without an LMS session. The website tests verify ordered progress/answer/submission requests and retries. CI installs the LTI optional dependencies so these tests run rather than skip.

For a browser smoke test with the real exported library and a local emulator:

```sh
.venv/bin/python scripts/lti_demo.py
```

Open `http://127.0.0.1:8766`. The emulator runs only on loopback and has no real LMS data. It uses temporary signing keys and state, which disappear when it stops. Test lesson selection, then learner launch, slide navigation, answers and result submission. Try a video to check playback progress. Production configuration requires HTTPS; `allow_local_http` exists only for loopback development.

Before production use, repeat that flow on the target LMS's staging installation. Confirm that its attempt score, completion and course status change as expected. Also test an unsuccessful result, browser refresh, retry after a service outage, and a browser with third-party cookies blocked. This repository does not contain that installation's deployment or credentials.

References: [LTI 1.3](https://www.imsglobal.org/spec/lti/v1p3/), [Deep Linking 2.0](https://www.imsglobal.org/spec/lti-dl/v2p0/), [Basic Outcomes with LTI 1.3](https://www.imsglobal.org/spec/lti-bo/v1p1/), [PyJWT validation](https://pyjwt.readthedocs.io/en/stable/usage.html), [Flask deployment](https://flask.palletsprojects.com/en/stable/deploying/).
