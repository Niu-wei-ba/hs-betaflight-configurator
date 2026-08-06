# Dual-version Configurator release

`bf.hs-fpv.com` opens the latest compatible Configurator by default and keeps two independent channels:

- `/` — compatibility gate, then redirects to the selected channel (latest by default)
- `/?version-picker=1` — standalone version-selection dialog
- `/v/2025.12.2/` — maintenance channel
- `/v/2026.6.1/` — latest channel

Selecting a channel from the welcome-page switch button or version dialog stores `bf-configurator-version` in the current origin's `localStorage`. A later visit to `/` opens that selected channel; without a recorded choice it opens 2026.6.1. If the static gate detects that the browser cannot run the latest channel, it shows a browser-update warning and automatically redirects to `/v/2025.12.2/` after about two seconds. Checking “以后不再提示” stores `bf-configurator-hide-compatibility-warning=1`; future incompatible visits still fall back to 12.2 without showing the warning. Compatibility fallbacks do not overwrite an explicitly selected version, so after the browser is upgraded the saved selection still applies.

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

## Rollback

On the server, point `apps/<version>/current` to a previous release for only the affected version. Point `portal/current` to a previous portal release only when the version-selection page itself must be rolled back.
