# Cloudflare deployment

This deployment serves the public library and its optional LTI connection at `knowledge.davinci4744.com`. GitHub continues to hold the source. Public website visitors need no LMS account.

The domain, D1 database, schema and signing bindings are deployed. Subsequent updates need a fresh build and `npm run deploy`; reuse the existing database and signing material. LMS provider registration and a real learner result check are separate steps described below.

The Cloudflare entry point uses TypeScript and Web Crypto. This keeps signing and verification in the platform runtime. The existing Python service remains available for local use and conventional server hosting. Both entry points use the same frontend, content sources, LTI routes and completion rules.

## GitHub Actions deployment

`.github/workflows/cloudflare.yml` checks pull requests and builds on pushes to `master` or `main`. Only the repository's default branch deploys, including manual runs from that branch. GitHub Pages is no longer a deployment target.

The check job runs the Python, website and Worker tests, typechecks, formatting checks, a fresh site build and a Wrangler dry run. It passes only `cloudflare-assets/` and `cloudflare-data/` to the deploy job. The deploy job applies D1 migrations and publishes those verified inputs and the retired-domain redirect with the pinned Wrangler version. It retains existing Worker signing secrets and D1 data. The artifact expires after one day and never contains `output/lti/`, credentials, state databases or local logs.

Add a repository Actions secret named `CLOUDFLARE_API_TOKEN`. Use a dedicated Cloudflare token restricted to this account and the `davinci4744.com` zone with:

- Account → Workers Scripts: Edit.
- Account → D1: Edit.
- Zone → Zone: Read.
- Zone → Workers Routes: Edit.

Keep the installation-specific `LTI_PLATFORM_ISSUER` and optional `LTI_OUTCOME_EXTENSION` in Actions secrets too. The build uses the issuer's origin for the frame policy; deployment uploads these settings as Worker secrets. A missing issuer stops publication before replacing the live service. `keep_vars` preserves remote bindings during deployment.

Create it under [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) using **Create Token → Create Custom Token**. Add the value directly to the [repository's Actions secrets](https://github.com/Ninjas4744-Organization/content-creator/settings/secrets/actions), never to chat or a committed file.

The account ID is already set in `wrangler.jsonc`; it is an identifier, not a credential. Do not reuse the interactive Wrangler OAuth login as the CI credential. The `production` GitHub environment may add repository-configured approval rules. A missing token fails with an explicit setup message before migrations or publishing.

After adding the secret, push to the default branch or run **Learning library** manually from that branch. The workflow verifies the public home page and `/health` after deployment. [Cloudflare's GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) describes the authentication model.

## Primary domain and retired address

`knowledge.davinci4744.com` is the only public library and LTI origin. The LMS registration and lesson links have moved to this hostname. The signing key, client ID, database and attempt identity remain unchanged, preserving saved progress and results.

`learn.davinci4744.com` is handled by a separate redirect Worker configured in `wrangler.redirect.jsonc`. It has no asset, database or signing-key bindings. Public GET/HEAD requests redirect permanently to the equivalent `knowledge` path and query. Stale `lti` query references are removed because browser session storage cannot be transferred between origins.

All requests under `/lti/`, the old `/health` endpoint and every non-GET/HEAD request return HTTP 410 without redirecting a request body. The active LTI service rejects the retired origin and retired lesson targets. Any old open learner tab must reopen its lesson from the updated LMS; stored progress remains available on the primary service.

GitHub Actions deploys the main library first and the redirect Worker second, then verifies the active health endpoint and the retired LTI response. The old hostname stays bound only to the redirect Worker so old public bookmarks do not become dead links.

## Services and costs

- **Workers Static Assets** serves the public website, presentations, images and fonts directly.
- **Workers** handles `/lti/*`, `/health` and MP4 requests on the primary site. Video responses stream byte ranges so chapter navigation and Safari playback work. Video and retired-domain redirect requests count toward the Worker request allowance. No whole video is buffered in Worker memory.
- **D1** stores short-lived launch/session records and saved attempts. An expiry index and an hourly cleanup limit retained data. Conditional updates prevent competing requests from overwriting one another.
- **R2 is optional.** The current media files fit the 25 MiB static-asset limit, so this package needs no R2 subscription. Packaging fails with the file name if a future asset exceeds that limit. Add media storage before publishing such files.

The deployment targets Workers Free and D1 Free. It does not select or upgrade a paid plan. The free Worker's 10 ms CPU allowance still needs measurement on the deployed service; local runtime tests do not prove edge CPU usage. Request/storage quotas also apply. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [asset limits](https://developers.cloudflare.com/workers/platform/limits/).

## Files

- `projects/learning-library/cloudflare/wrangler.jsonc`: domain, LMS connection, D1 binding and asset routing.
- `projects/learning-library/cloudflare/src/`: the Workers, signed messages, completion logic and D1 storage.
- `projects/learning-library/cloudflare/wrangler.redirect.jsonc`: the retired hostname and its isolated redirect Worker.
- `projects/learning-library/cloudflare/migrations/`: D1 schema.
- `projects/learning-library/output/cloudflare-assets/`: only public files; safe to upload as assets.
- `projects/learning-library/output/cloudflare-data/lessons.json`: the assessment module bundled into the Worker, outside public assets.
- `projects/learning-library/output/lti/`: private signing material. Keep it out of Git, public assets and CI artifacts.

## Build and check

From the repository root, with the repository's Python environment already installed:

```sh
npm --prefix projects/learning-library ci
npm --prefix projects/learning-library run build
npm --prefix projects/learning-library/cloudflare ci
npm --prefix projects/learning-library/cloudflare run prepare:content
npm --prefix projects/learning-library/cloudflare run typecheck
npm --prefix projects/learning-library/cloudflare test
npm --prefix projects/learning-library/cloudflare run check:deploy
```

Build for the origin root with `EXPO_BASE_URL` unset. The packager copies the export into a separate asset directory and creates the private assessment module. It does not change the GitHub Pages export. Static routing serves portable players and supporting files. LTI routes and MP4 byte-range handling run before asset lookup. The primary home page is served directly as a static asset. Packaging records media sizes alongside the private assessment module.

The tests run in the local Workers runtime with a real local D1 binding. They cover signed launches and selection, browser binding, replay rejection, server-calculated scores, completion and retries, refreshed result tokens, video coverage, concurrent updates, public access and expired-record cleanup. Media tests cover streamed byte ranges, conditional requests and MP4 routing. Network calls to the test LMS are intercepted; tests make no live LMS changes.

Platform request mocks also perform native Worker request validation. Workers supports `redirect: manual`, so the service uses that mode and rejects non-success responses, including redirects. This applies to public key lookup, service tokens and result reporting. Rejection diagnostics contain a fixed stage and error category; never add launch bodies, JWTs, credentials or learner details to logs.

## Account and domain

Sign in to the Cloudflare account that owns `davinci4744.com`. From `projects/learning-library/cloudflare/`:

```sh
npx wrangler login
npx wrangler whoami
```

Review `wrangler.jsonc`. Its `TOOL_URL` is the service's public HTTPS origin. Copy `PLATFORM_ISSUER` exactly from the target LMS registration form and use the same `CLIENT_ID` on both sides. The configured domain is `knowledge.davinci4744.com`; an existing DNS record at that hostname must be reviewed before attaching the Worker. Do not replace the main website at `davinci4744.com`.

For local builds, store `platform_issuer` and optional `outcome_extension` in the ignored `projects/learning-library/lti.platform.local.json`, or set `PLATFORM_ISSUER` and `OUTCOME_EXTENSION` in the environment. The latter is an XML element name supplied by the LMS's integration profile; leave it empty for standard Basic Outcomes. The signing-material script includes configured installation settings in its private upload file. Never copy that file or the local profile into public assets. These values are configuration, not provider-specific code.

If the account has several memberships, set `CLOUDFLARE_ACCOUNT_ID` to the account that owns the domain, or add that account ID to the config. No account credentials belong in this repository.

## Create persistent state

From `projects/learning-library/cloudflare/`, first check whether the named database already exists:

```sh
npx wrangler d1 list
```

For a new database:

```sh
npx wrangler d1 create davinci-library-lti --binding DB --update-config
```

Keep exactly one `DB` binding in the config and replace the all-zero placeholder ID with the created database's UUID. If reusing an existing database, use its UUID instead of creating another one. Apply the schema:

```sh
npx wrangler d1 migrations apply DB --remote
```

The database must persist across deployments. These migrations create only this service's own tables. Never point `DB` at an unrelated application database.

## Signing material and publishing

From the repository root:

```sh
.venv/bin/python -m pip install -e '.[lti]'
.venv/bin/python scripts/cloudflare_secrets.py
```

This creates or reuses the existing RSA key and writes a private `cloudflare-secrets.json` with mode `0600`. It prints paths, never key values. Keep the key across deployments and back it up securely. The public JWK endpoint exposes only public key fields.

After the build, tests and dry run pass, publish from `projects/learning-library/cloudflare/`:

```sh
npm run deploy
npx wrangler secret bulk ../output/lti/cloudflare-secrets.json
```

The first deployment serves the public website immediately. LTI reports `setup_required` until both signing bindings are uploaded. `secret bulk` publishes the bindings; it retains the deployed code. Do not run it against a different Worker name. The signing file must never be uploaded as a static asset or pasted into chat.

Cloudflare attaches the configured custom domain and manages HTTPS. `/health` should return `status: ok` and `lti: configured`. No LTI secrets are available to the frontend bundle.

## LMS registration

Use these tool URLs in the LMS's LTI 1.3 provider form:

| Field | Value |
| --- | --- |
| Default target URL | `https://knowledge.davinci4744.com/lti/resource` |
| Deep link URL | `https://knowledge.davinci4744.com/lti/resource` |
| Login initiation URL | `https://knowledge.davinci4744.com/lti/login` |
| Public keyset URL | `https://knowledge.davinci4744.com/lti/jwks` |
| Redirect URI, if requested | `https://knowledge.davinci4744.com/lti/launch` |
| Client ID | `davinci-learning-library` |
| Deployment ID | `na` for the current connection |

Enable **wait for score reporting from provider** on each assigned LTI content item. Select a lesson through the library, launch it as a learner and submit a result. Confirm its score, completion and course status in the LMS. Also open the public library without signing in to confirm public access.

The existing LMS compatibility profile is retained. The Cloudflare entry point does not add support for other LMS-specific endpoints or AGS. See [the LTI guide](lti.md) for completion rules and protocol details.

After publication, measure CPU time for a launch, a lesson selection response and a result submission before relying on the free CPU budget. Account usage and service health must be checked independently of successful local tests.
