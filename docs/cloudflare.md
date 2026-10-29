# Cloudflare deployment and R2 content

The application lives in `learning-library/` and serves `knowledge.davinci4744.com`.
Workers Static Assets hosts the website and brand assets. A dedicated R2 Standard bucket,
`davinci-learning-library`, hosts the public catalog and published lessons. The Worker
binding is `CONTENT`. The bucket does not need public r2.dev access or a custom media domain.

## Application deployment

GitHub Actions checks Python tools, the website and Worker, then deploys the verified
application assets from the repository's default branch. Application builds do not scan
`projects/`, render lessons, upload media or modify the R2 catalog. Adding or updating a
published lesson does not require an application deployment.

The existing `CLOUDFLARE_API_TOKEN` Actions secret needs Workers Scripts edit, Zone read,
Workers Routes edit and the account permissions needed to bind the existing R2 bucket.
Keep it private. Website visitors never receive an upload credential.

From the repository root:

```sh
npm --prefix learning-library ci
npm --prefix learning-library run typecheck
npm --prefix learning-library test
npm --prefix learning-library run build
npm --prefix learning-library/cloudflare ci
npm --prefix learning-library/cloudflare run typecheck
npm --prefix learning-library/cloudflare test
npm --prefix learning-library/cloudflare run check:deploy
```

After checks, deployment is available through GitHub Actions or, with Wrangler authenticated:

```sh
npm --prefix learning-library/cloudflare run deploy
```

Worker tests use local R2 emulation, never production objects. Application assets must
still fit the 25 MiB static asset limit; R2 lessons are not subject to that limit.
The packager rejects private configuration and symlinks.

## One-time R2 setup

Enable R2 in the account's Cloudflare dashboard and create the bucket:

```sh
cd learning-library/cloudflare
npx wrangler r2 bucket create davinci-learning-library
```

The bucket name is configured in `wrangler.jsonc`. Use Standard storage. The Worker exposes
only the public catalog, published lesson paths and the application's local brand assets.
Other R2 paths, including catalog history, are not exposed. Anyone with a public lesson
link can view and share it; `unlisted` controls gallery discovery only.

## Publish lessons

Install the optional upload dependency into the repository environment:

```sh
.venv/bin/python -m pip install -e '.[storage]'
```

Create an R2 Object Read and Write API token restricted to this bucket. Supply
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` through a private shell
environment. `R2_BUCKET` defaults to `davinci-learning-library`. `.env.example` documents
names only; scripts do not automatically load `.env`. Never paste keys into chat or commit them.

Prepare selected lessons, check the package, then publish:

```sh
.venv/bin/python scripts/prepare_gallery.py --project my-training
.venv/bin/python scripts/publish_library.py --dry-run
.venv/bin/python scripts/publish_library.py
```

Repeat `--project` to select several lessons. `--all` explicitly packages all local projects
for migration; inspect that selection before publication. Source JSON stays under
`projects/<id>/`; gallery titles and descriptions live in `projects/library.json`.
Generated packages stay under ignored `learning-library/output/content/`.

The publisher preflights files and links, uploads a unique immutable release, downloads
and verifies every uploaded file by SHA-256, and then merges selected entries into
`library/catalog.json`. Unselected lessons remain. Conditional writes prevent a competing
publisher from silently losing another update. On a conflict, rerun the publication after
checking the current catalog. Upload failures leave the existing catalog in use.

Previous catalogs are retained in `library/history/`; immutable releases remain available
for recovery and existing open lessons. Old releases consume storage until an operator
explicitly removes unreferenced versions. The publisher performs no automatic deletion.
Successful uploads write a local receipt under `learning-library/output/r2/`.

## Existing media migration

The initial migration uploaded and verified 9 lessons and 96 assets. Existing published
player packages now remain in the ignored `learning-library/output/published/` cache. Future
video publications use local outputs and R2, rather than committing MP4s or SCORM archives.
Removing current media files does not remove their blobs from previous Git commits.
Rewriting Git history is a separate, coordinated operation.

R2 serves the catalog with revalidation and immutable release assets with long caching.
The Worker streams byte ranges directly from R2 for video seeking, supports HEAD and
conditional requests, and accepts only GET/HEAD on published content routes.

## Retired integrations

`/health` returns `{"status":"ok"}`. `/lti` and `/lti/*` return HTTP 410. The separate
redirect Worker sends public GET/HEAD bookmarks from `learn.davinci4744.com` to the current
host, with retired session parameters removed; retired integration requests are not forwarded.
SCORM packages report progress and results through the learning platform hosting the package.
