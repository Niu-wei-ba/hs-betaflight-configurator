---
name: project-server-deploy
description: Deploy this hs-betaflight-configurator project to the user's own server at 106.54.16.124, including the static frontend and firmware API service. Use when the user asks to publish, redeploy, deploy to server, or update bf.hs-fpv.com.
---

# Project Server Deploy

Use this skill for production deploys of this repository to the user's own server. Do not use GitHub Actions or Cloudflare for this deploy path.

## Server

- SSH: `root@106.54.16.124`
- SSH key path: `/Users/lihao/Downloads/ssh.pem`
- Site URL: `https://bf.hs-fpv.com`
- Static release root: `/www/wwwroot/bf.hs-fpv.com/releases/<release_id>`
- Static current symlink: `/www/wwwroot/bf.hs-fpv.com/current`
- Firmware API release root: `/www/wwwroot/bf.hs-fpv.com/api/releases/<release_id>`
- Firmware API cache: `/www/wwwroot/bf.hs-fpv.com/api/cache`
- Firmware API server-only env file: `/www/wwwroot/bf.hs-fpv.com/api/firmware-api.env`
- Firmware API source repo: `git@github.com:Niu-wei-ba/betaflight-api.git`
- Local firmware API repo: `/Users/lihao/Documents/hs-betaflight-firmware-api`
- Nginx vhost: `/www/server/panel/vhost/nginx/bf.hs-fpv.com.conf`
- Firmware API container: `bfc_firmware_api` (runs with `--network host`)
- Firmware API listen: `127.0.0.1:4180`
- Egress proxy VPS: `43.134.228.13` (SSH key: `~/.ssh/proxy.pem`, alias: `hk-proxy-vps`)
- SSH tunnel service: `bf-proxy-tunnel.service` on API server (forwards `127.0.0.1:18388`)

Never copy or write the private key contents into the repo. It is enough to reference the local key path.

## Current Production Shape

- Server OS: OpenCloudOS 9.4
- Web server: BaoTa-managed nginx
- `bf.hs-fpv.com` nginx root points to `/www/wwwroot/bf.hs-fpv.com/current`
- `/api/` proxies to `http://127.0.0.1:4180`
- Firmware API runs from the private backend repo in Docker using a per-release image `bfc_firmware_api:api-<backend_sha>`
- Metadata base URL: `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/mirror-metadata`
- Firmware artifact base URL: `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com`
- COS on-demand upload is enabled only when `/www/wwwroot/bf.hs-fpv.com/api/firmware-api.env` exists and contains `TENCENT_COS_BUCKET`, `TENCENT_COS_REGION`, `TENCENT_COS_SECRET_ID`, and `TENCENT_COS_SECRET_KEY`

## Release Branch Policy

- The frontend release and deployment branch is `feature/betaflight-2026.6.1`.
- Do not deploy the frontend from `feat/custom-betaflight-2026.06.3` or another feature branch.
- The remote support snapshot frontend is part of the `feature/betaflight-2026.6.1` history; deploy the checked-out commit from that branch.
- The companion firmware API is maintained in `/Users/lihao/Documents/hs-betaflight-firmware-api` on `feature/cos-private-read` unless an explicit backend branch transition is requested.
- The active hosted dev URL is `https://betaflight.hs-fpv.com/v/2026.6.1/`; preserve the portal at `/` and the `/v/2026.6.1/` versioned release layout.

## Deploy Steps

Preferred deploy command:

```bash
scripts/deploy-server.sh
```

The frontend deploy script only publishes static frontend assets. It must not upload API runtime files or restart `bfc_firmware_api`; API deploys are handled from the private backend repo.

For API-only deploys, deploy from `/Users/lihao/Documents/hs-betaflight-firmware-api` to `/www/wwwroot/bf.hs-fpv.com/api/releases/api-<backend_sha>`, build the Docker image from that release, and restart `bfc_firmware_api`.

By default, the API syncs metadata from COS at container startup: `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/mirror-metadata`.

Manual steps, if the script cannot be used:

1. Use a clean local worktree and choose `release_id=$(git rev-parse --short HEAD)`.
2. Build the frontend locally:

```bash
source ~/.nvm/nvm.sh
nvm use 20.19.0
VITE_SOURCE_CODE_URL=https://github.com/Niu-wei-ba/hs-betaflight-configurator npm run build
```

3. Create server release directories:

```bash
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 \
  "mkdir -p /www/wwwroot/bf.hs-fpv.com/releases/$release_id"
```

4. Upload frontend static files:

```bash
rsync -az --delete -e "ssh -i /Users/lihao/Downloads/ssh.pem -o BatchMode=yes" \
  src/dist/ \
  root@106.54.16.124:/www/wwwroot/bf.hs-fpv.com/releases/$release_id/
```

5. Atomically switch the static release:

```bash
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 \
  "ln -sfn /www/wwwroot/bf.hs-fpv.com/releases/$release_id /www/wwwroot/bf.hs-fpv.com/current.next && mv -Tf /www/wwwroot/bf.hs-fpv.com/current.next /www/wwwroot/bf.hs-fpv.com/current"
```

6. Keep only the newest 5 static releases under `/www/wwwroot/bf.hs-fpv.com/releases`.

## Private Backend API Deploy

Use this when publishing only the firmware API backend:

```bash
cd /Users/lihao/Documents/hs-betaflight-firmware-api
release_id=api-$(git rev-parse --short HEAD)
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 \
  "mkdir -p /www/wwwroot/bf.hs-fpv.com/api/releases/$release_id /www/wwwroot/bf.hs-fpv.com/api/cache"
rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude artifacts \
  -e "ssh -i /Users/lihao/Downloads/ssh.pem -o BatchMode=yes" \
  ./ \
  root@106.54.16.124:/www/wwwroot/bf.hs-fpv.com/api/releases/$release_id/
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 "
set -e
APP=/www/wwwroot/bf.hs-fpv.com/api/releases/$release_id
CACHE=/www/wwwroot/bf.hs-fpv.com/api/cache
ENV_FILE=/www/wwwroot/bf.hs-fpv.com/api/firmware-api.env
docker build -t bfc_firmware_api:$release_id \"\$APP\"
docker rm -f bfc_firmware_api >/dev/null 2>&1 || true
docker run -d \
  --name bfc_firmware_api \
  --restart unless-stopped \
  --network host \
  -v \"\$CACHE:/cache\" \
  --env-file \"\$ENV_FILE\" \
  -e HOST=127.0.0.1 \
  -e PORT=4180 \
  -e FIRMWARE_METADATA_DIR=/cache/firmware-metadata \
  -e FIRMWARE_TASK_DIR=/cache/firmware-tasks \
  -e FIRMWARE_WORK_DIR=/cache/firmware-work \
  bfc_firmware_api:$release_id
"
```

After API deploys, keep only the newest 5 directories under `/www/wwwroot/bf.hs-fpv.com/api/releases`.

## Egress Proxy (build.betaflight.com)

The API server cannot TLS-connect to `build.betaflight.com` directly (RST at Client Hello). An SSH tunnel + Squid proxy on a Singapore VPS solves this:

- Proxy VPS: `43.134.228.13` (SSH key: `~/.ssh/proxy.pem`, user: `root`, alias: `hk-proxy-vps`)
- Squid on VPS: listening `127.0.0.1:18388`, Basic auth user `bfcproxy`
- SSH tunnel service on API server: `bf-proxy-tunnel.service` forwards `127.0.0.1:18388` → VPS Squid
- `firmware-api.env` contains `HTTPS_PROXY`, `HTTP_PROXY`, and `NO_PROXY` (excludes `.myqcloud.com`)
- `/healthz` reports `outboundHttpsProxyConfigured: true` when active
- Squid ACL only allows CONNECT to `.betaflight.com`, `.github.com`, `.githubusercontent.com` on port 443

To verify the tunnel is up on the API server:

```bash
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 "systemctl status bf-proxy-tunnel && ss -tlnp | grep 18388"
```

If the tunnel is down, restart it:

```bash
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 "systemctl restart bf-proxy-tunnel"
```

The container must run with `--network host` (not `-p 127.0.0.1:4180:4180`) so it can reach the host's SSH tunnel on `127.0.0.1:18388`.

7. Ensure nginx proxies `/api/` to `127.0.0.1:4180`. Before editing the vhost, always copy it to a timestamped `.bak.YYYYMMDDHHMMSS` file. After editing, run:

```bash
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 "nginx -t && systemctl reload nginx"
```

## Verification

Run these after each deploy:

```bash
curl -skI https://bf.hs-fpv.com/
curl -sk https://bf.hs-fpv.com/tabs/privacy_policy.html | head
curl -sk https://bf.hs-fpv.com/healthz
curl -sk https://bf.hs-fpv.com/api/targets
curl -sk "https://bf.hs-fpv.com/api/firmware/url?version=2025.12.2&target=SPEEDYBEEF405V3"
ssh -i /Users/lihao/Downloads/ssh.pem root@106.54.16.124 "docker ps --filter name=bfc_firmware_api && docker logs --tail 40 bfc_firmware_api"
```

Expected API behavior:

- `/healthz` returns `status: ok`
- `/api/targets` returns official Betaflight targets
- `/api/firmware/url` returns a COS URL under `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/firmware/...`

## Rollback

Rollback static frontend by repointing `current` to an older release under `/www/wwwroot/bf.hs-fpv.com/releases/`.

Rollback the API by restarting `bfc_firmware_api` with the matching older path under `/www/wwwroot/bf.hs-fpv.com/api/releases/`.
