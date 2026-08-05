# Test-to-production frontend release

`betaflight.hs-fpv.com` and `bf.hs-fpv.com` have independent static release roots:

- Test: `/www/wwwroot/betaflight.hs-fpv.com`
- Production: `/www/wwwroot/bf.hs-fpv.com`

Both domains deliberately proxy same-origin `/api/`, `/healthz`, and `/presets/` requests to the same `bfc_firmware_api` listener at `127.0.0.1:4180`. The backend is host-neutral and must not be redeployed for a frontend-only test release.

## Deploy a test artifact

Run this only from the worktree being tested:

```bash
scripts/deploy-test-server.sh
```

The script builds the current worktree, uploads a timestamped `test-<sha>-<timestamp>` release to the test root, and atomically switches only the test `current` symlink. It does not modify `bf.hs-fpv.com`.

## Promote the tested artifact

First copy the release id printed by `deploy-test-server.sh`. Promotion never rebuilds the frontend: it copies the currently active test artifact on the server into a new production release directory, then atomically switches only the production `current` symlink.

```bash
BFC_PROMOTE_CONFIRM=bf.hs-fpv.com scripts/promote-test-release.sh <test-release-id>
```

The confirmation value and the requirement that the selected artifact is the active test release prevent accidental direct production deploys. The script keeps the five newest production releases and verifies the production homepage plus read-only API endpoints.
