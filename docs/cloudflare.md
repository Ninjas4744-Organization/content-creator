# Cloudflare deployment

The public learning library is served at `knowledge.davinci4744.com`. Learning-platform integration uses downloadable [SCORM 1.2 packages](scorm.md). The website needs no LMS registration, signing keys, learner database or server-side result reporting.

## GitHub Actions deployment

`.github/workflows/cloudflare.yml` checks pull requests and builds on pushes to `master` or `main`. Only the repository's default branch deploys, including manual runs from that branch.

The check job runs Python, website and Worker tests, typechecks, formatting checks, a fresh site build and Wrangler dry runs. Only `cloudflare-assets/` and `cloudflare-data/` pass to the deploy job. That job publishes the verified assets and the retired-domain redirect with the pinned Wrangler version. The artifact expires after one day.

The only required repository Actions secret is `CLOUDFLARE_API_TOKEN`. Use a dedicated token restricted to the configured account and domain, with Workers Scripts edit, Zone read and Workers Routes edit permissions. The deployment no longer uses D1 permissions or installation-specific LMS secrets. Add credentials directly to the repository's Actions secrets, never to chat or a committed file.

The account identifier is already configured in `wrangler.jsonc`. The `production` GitHub environment may add repository-configured approval rules. A missing token fails before publishing.

After deployment, the workflow checks the home page, `/health` and the retired integration endpoints on both hostnames. `/health` returns `{"status":"ok"}` without LMS configuration.

## Hosting and retired connections

- Workers Static Assets serves the website, presentations, SCORM ZIPs, images and fonts.
- The Worker streams MP4 byte ranges for playback and chapter seeking. It also serves `/health` and returns HTTP 410 for `/lti` and `/lti/*`, including old launches and result submissions.
- `learn.davinci4744.com` uses the separate redirect Worker in `wrangler.redirect.jsonc`. Public GET/HEAD bookmarks redirect permanently to the equivalent primary path and query, with retired session references removed. Integration requests, its old health endpoint and other methods return HTTP 410 without forwarding request bodies.
- No D1 binding, database migration, scheduled cleanup or signing operation is part of the application or deployment. Existing remote databases and private local files are not deleted by this change.

Current media uses static assets. Packaging rejects files over 25 MiB; configure alternative media storage before publishing larger assets. No paid plan is selected by these commands.

## Files

- `projects/learning-library/cloudflare/wrangler.jsonc`: primary domain and asset routing.
- `projects/learning-library/cloudflare/src/`: public Worker, video streaming and retired-domain redirect.
- `projects/learning-library/output/cloudflare-assets/`: public site files, including downloadable SCORM packages.
- `projects/learning-library/output/cloudflare-data/media.json`: video sizes bundled into the Worker for byte-range responses. No assessment bank is generated.

## Build and verify

From the repository root, after Python setup:

```sh
npm --prefix projects/learning-library ci
npm --prefix projects/learning-library run typecheck
npm --prefix projects/learning-library test
npm --prefix projects/learning-library run build
npm --prefix projects/learning-library/cloudflare ci
npm --prefix projects/learning-library/cloudflare run prepare:content
npm --prefix projects/learning-library/cloudflare run typecheck
npm --prefix projects/learning-library/cloudflare test
npm --prefix projects/learning-library/cloudflare run check:deploy
```

Build for the origin root with `EXPO_BASE_URL` unset. The packager copies the public export, writes security headers and records MP4 sizes. It rejects symlinks, private configuration, signing files and oversized assets. It does not read LMS settings or content source documents.

Tests run in the local Workers runtime without a database or LMS credentials. They cover public lessons, both SCORM download formats, retired integration routes, health, redirects and video ranges. SCORM package and runtime tests additionally cover completion, scores, resume and attempts; real LMS persistence still requires a check in the target learning platform.

## Publish manually

Sign in to the Cloudflare account that owns the configured domain and run from `projects/learning-library/cloudflare/`:

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

Review the account and custom domain in `wrangler.jsonc` before publishing. The configured hostname is `knowledge.davinci4744.com`; the main website at `davinci4744.com` is separate. For CI, use the dedicated API token instead of interactive login.

The deploy command prepares the current site export, publishes the library and then publishes the retired-domain redirect. Build and checks should pass first. Local tests do not measure deployed CPU usage or account quotas.
