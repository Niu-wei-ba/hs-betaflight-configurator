# Dual-version Configurator release

`bf.hs-fpv.com` opens the latest compatible Configurator by default and keeps two independent channels:

- `/` — compatibility gate, then redirects to the selected channel (latest by default)
- `/?version-picker=1` — standalone version-selection dialog
- `/v/2025.12.2/` — maintenance channel
- `/v/2026.6.1/` — latest channel

Selecting a channel from the welcome-page switch button or version dialog stores `bf-configurator-version` in the current origin's `localStorage`. A later visit to `/` opens that selected channel; without a recorded choice it opens 2026.6.1. If the static gate detects that the browser cannot run the latest channel, it shows a browser-update warning with a 10-second countdown and then redirects to `/v/2025.12.2/`. The user can enter 12.2 immediately; that manual choice is remembered. Checking “以后不再提示” stores `bf-configurator-hide-compatibility-warning=1`; future incompatible visits still fall back to 12.2 without showing the warning. Automatic compatibility fallbacks do not overwrite an explicitly selected version, so after the browser is upgraded the saved selection still applies.

The test domain has the identical route layout. Both domains keep the existing same-origin `/api/`, `/healthz`, and `/presets/` proxy to `bfc_firmware_api` at `127.0.0.1:4180`; a frontend release does not restart or redeploy that API.

## Server layout

```text
/www/wwwroot/<host>/
  portal/releases/<release-id>/
  portal/current -> releases/<release-id>
  apps/2025.12.2/releases/<release-id>/
  apps/2025.12.2/current -> releases/<release-id>
  apps/2026.6.1/releases/<release-id>/
  apps/2026.6.1/current -> releases/<release-id>
```

Before the first release, install the matching vhost template from `deploy/nginx/` on the server. Back up the existing BaoTa vhost, then run `nginx -t` and reload Nginx. Do not replace the API locations.

## Publish to test

Run the following commands from `/Users/lihao/Documents/betaflight-configurator-2026.6.1`, which is the release-control worktree. Run the portal once when its content changes:

```bash
scripts/deploy-version-portal-test.sh
```

Build and publish each Configurator channel from its own worktree:

```bash
scripts/deploy-versioned-test-release.sh 2025.12.2
scripts/deploy-versioned-test-release.sh 2026.6.1
```

The commands validate the expected branch, use the appropriate Node release, build with `VITE_WEB_BASE_PATH=/v/<version>/`, upload an immutable artifact, and atomically move only that channel's test `current` symlink. `scripts/deploy-test-server.sh` remains a compatibility shortcut for 2026.6.1.

Verify the root page, both version URLs, PWA installation/update, `/healthz`, and `/api/targets`. Test both channels in separate browser tabs to ensure their Service Workers are scoped to their own `/v/<version>/` path.

## Promote to production

Only a test artifact that is active for the same channel may be promoted:

```bash
BFC_PROMOTE_CONFIRM=bf.hs-fpv.com scripts/promote-versioned-release.sh 2025.12.2 <test-release-id>
BFC_PROMOTE_CONFIRM=bf.hs-fpv.com scripts/promote-versioned-release.sh 2026.6.1 <test-release-id>
BFC_PROMOTE_CONFIRM=bf.hs-fpv.com scripts/promote-version-portal.sh <test-portal-release-id>
```

Promotion copies the tested static files to the corresponding production channel and atomically changes only that channel's `current` symlink. A failure or rollback of one version must never switch the other version or restart `bfc_firmware_api`.

## Cached clients during a release

Before switching a channel, both deployment scripts carry forward missing files from the previous active release's `assets/` directory. New files take precedence. Keep these hashed assets even when deleting old release directories: cached HTML, installed PWAs, and open tabs may still request them. Production promotion also retains production assets that were never present on the test host.

Both version channels' Nginx locations revalidate the app shell and Service Worker (`Cache-Control: no-cache`), cache hashed assets for a year, and return 404 for missing assets instead of the app's HTML. Configure the CDN to respect these origin cache headers for each `/v/<version>/` entry, `index.html`, and `sw.js`; overriding them with a fixed HTML TTL defeats revalidation. After installing this policy, purge existing cached HTML responses, including any HTML accidentally cached at a JavaScript asset URL.

Validate an upgrade using a page loaded before the release and an ordinary reload after switching, without clearing browser data. The previous main script and lazy chunks must remain JavaScript responses, the new app must load, and a nonexistent asset must return 404. The existing PWA update dialog provides the user-facing update action; never force a reload while a controller is connected or settings are unsaved.

For a production-only build from `feature/betaflight-2026.6.1`, validate the versioned build with a local preview. Do not switch the hosted Dev frontend to the production branch. Before atomically activating the uploaded production release, carry forward the previous active production release's assets using the same `rsync -a --ignore-existing` step as promotion; retained old HTML and open tabs still need those files. When first installing asset retention, backfill missing assets from every retained release before any cleanup.

## Rollback

On the server, point `apps/<version>/current` to a previous release for only the affected version. Point `portal/current` to a previous portal release only when the version-selection page itself must be rolled back.
