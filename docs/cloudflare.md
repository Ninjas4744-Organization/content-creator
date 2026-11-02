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
npm --prefix learning-library/admin ci
npm --prefix learning-library/admin run check
npm --prefix learning-library/admin test
npm --prefix learning-library/admin run build:production
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
for migration; inspect that selection before publication. Editable source archives live separately under `project-sources/` in R2 and are not served publicly. Restore them with `scripts/project_store.py pull <id>` into the ignored local `projects/<id>/` workspace; gallery metadata travels with each project in `publication.json`. See [source editing and recovery](project-sources.md).
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

With an existing Wrangler login, a prepared package can also be published without
creating or exporting S3 credentials:

```sh
.venv/bin/python scripts/publish_library.py --dry-run
.venv/bin/python scripts/publish_library_wrangler.py
```

This route verifies uploaded bytes, preserves unrelated lessons and the previous
catalog, and checks that the catalog has not changed before promotion. Run only
one catalog publisher at a time: Wrangler does not expose an atomic conditional
object write. Use the S3 publisher above when concurrent publication is needed.
Both publishers accept `--directory` for an explicitly prepared package, including
already reviewed HTML and PowerPoint files with custom project layouts.

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


## Protected production admin

The admin application is deployed at `https://knowledge.davinci4744.com/admin/` in the same Worker as the public library. Its reviewable deployment source lives in `learning-library/admin/`, synchronized from the sibling `content-creator-admin` repository using that app's `npm run sync:deployment`. The CI pipeline checks and builds both apps, then `prepare_cloudflare.py` mounts the admin export under `/admin`.

Create a self-hosted Cloudflare Access application protecting `knowledge.davinci4744.com/admin` and its subpaths. The public library paths stay public. Its Allow policy must name only the authorized email addresses. Store `ADMIN_ACCESS_ISSUER`, `ADMIN_ACCESS_AUD`, and `ADMIN_EMAILS` with Wrangler secrets; keep personal email addresses and all credentials out of Git. The issuer is the team's `https://<team>.cloudflareaccess.com` domain and the audience is the Access application's AUD tag. A missing configuration denies all admin requests. A signed token must also pass server-side issuer, audience, signature, expiry and explicit email checks. Cross-origin mutation requests are rejected.

The production admin uses `/admin/api/catalog`, `/admin/api/galleries`, `/admin/api/import`, `/admin/api/history`, and `/admin/api/restore`. It loads the authoritative `library/catalog.json` from R2. The local Node API remains loopback-only and does not gain a public write mode.

Before promoting a change, the Worker validates catalog fields and any new media references, writes a private recovery snapshot under `library/admin-history/`, and conditionally writes `library/catalog.json` only if the original R2 ETag still matches. Stale editors and concurrent publishers receive HTTP 409 rather than silently losing an update. The public catalog contains no admin history or authentication state. History is available only through the protected admin API; the latest 30 entries are shown and earlier private snapshots are retained for recovery. Restoring a snapshot uses the same validation and conditional-write boundary and also retains the state being replaced.

Library edits through the deployed admin appear on the public library's next load, without exporting, importing or deploying application code. Application deployments still run the checks above and preserve the existing R2 catalog and immutable media. Newly referenced files must already exist in the bucket; uploading and rendering media remain separate workflows.
