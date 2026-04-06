#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
SITE_URL="${BFC_DEPLOY_SITE_URL:-https://bf.hs-fpv.com}"
SITE_ROOT="${BFC_DEPLOY_SITE_ROOT:-/www/wwwroot/bf.hs-fpv.com}"
NGINX_VHOST="${BFC_DEPLOY_NGINX_VHOST:-/www/server/panel/vhost/nginx/bf.hs-fpv.com.conf}"
API_CONTAINER="${BFC_DEPLOY_API_CONTAINER:-bfc_firmware_api}"
API_PORT="${BFC_DEPLOY_API_PORT:-4180}"
KEEP_RELEASES="${BFC_DEPLOY_KEEP_RELEASES:-5}"
NODE_VERSION="${BFC_DEPLOY_NODE_VERSION:-20.19.0}"
FIRMWARE_METADATA_BASE_URL="${FIRMWARE_METADATA_BASE_URL:-__LOCAL_BUNDLE__}"
FIRMWARE_ARTIFACT_BASE_URL="${FIRMWARE_ARTIFACT_BASE_URL:-https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com}"
VITE_SOURCE_CODE_URL="${VITE_SOURCE_CODE_URL:-https://github.com/Niu-wei-ba/hs-betaflight-configurator}"
RELEASE_ID="${BFC_DEPLOY_RELEASE_ID:-$(git rev-parse --short HEAD)}"

if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || (( KEEP_RELEASES < 1 )); then
    echo "BFC_DEPLOY_KEEP_RELEASES must be a positive integer." >&2
    exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
    echo "SSH key not found: $SSH_KEY" >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Warning: local worktree has uncommitted changes; release id remains $RELEASE_ID." >&2
fi

SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes"

ssh_server() {
    ssh "${SSH_ARGS[@]}" "$SSH_HOST" "$@"
}

echo "Deploying $RELEASE_ID to $SITE_URL"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use "$NODE_VERSION" >/dev/null
fi

VITE_SOURCE_CODE_URL="$VITE_SOURCE_CODE_URL" npm run build
npm run firmware:metadata

ssh_server "mkdir -p '$SITE_ROOT/releases/$RELEASE_ID' '$SITE_ROOT/api/releases/$RELEASE_ID' '$SITE_ROOT/api/cache'"

rsync -az --delete -e "$RSYNC_SSH" \
    src/dist/ \
    "$SSH_HOST:$SITE_ROOT/releases/$RELEASE_ID/"

rsync -az --delete -e "$RSYNC_SSH" \
    scripts resources artifacts/firmware-metadata package.json \
    "$SSH_HOST:$SITE_ROOT/api/releases/$RELEASE_ID/"

ssh_server bash -s -- \
    "$RELEASE_ID" \
    "$SITE_ROOT" \
    "$NGINX_VHOST" \
    "$API_CONTAINER" \
    "$API_PORT" \
    "$KEEP_RELEASES" \
    "$FIRMWARE_METADATA_BASE_URL" \
    "$FIRMWARE_ARTIFACT_BASE_URL" <<'REMOTE'
set -euo pipefail

release_id="$1"
site_root="$2"
nginx_vhost="$3"
api_container="$4"
api_port="$5"
keep_releases="$6"
firmware_metadata_base_url="$7"
firmware_artifact_base_url="$8"

if [[ "$firmware_metadata_base_url" == "__LOCAL_BUNDLE__" ]]; then
    firmware_metadata_base_url=""
fi

app="$site_root/api/releases/$release_id"
cache="$site_root/api/cache"

docker rm -f "$api_container" >/dev/null 2>&1 || true
docker_env=(
    -e HOST=0.0.0.0
    -e PORT="$api_port"
    -e FIRMWARE_ARTIFACT_BASE_URL="$firmware_artifact_base_url"
)

if [[ -n "$firmware_metadata_base_url" ]]; then
    docker_env+=(
        -e FIRMWARE_METADATA_BASE_URL="$firmware_metadata_base_url"
        -e FIRMWARE_METADATA_DIR=/cache/firmware-metadata
    )
else
    docker_env+=(
        -e FIRMWARE_METADATA_DIR=/app/firmware-metadata
    )
fi

docker run -d \
    --name "$api_container" \
    --restart unless-stopped \
    -p "127.0.0.1:$api_port:$api_port" \
    -v "$app:/app:ro" \
    -v "$cache:/cache" \
    -w /app \
    "${docker_env[@]}" \
    node:20 node scripts/serve-firmware-api.mjs

sleep 2

if grep -q "proxy_pass http://127.0.0.1:$api_port;" "$nginx_vhost"; then
    echo "Nginx API proxy already points to 127.0.0.1:$api_port"
elif grep -q "Betaflight mirror API not deployed yet" "$nginx_vhost"; then
    python3 - "$nginx_vhost" "$api_port" <<'PY'
from pathlib import Path
from datetime import datetime
import sys

p = Path(sys.argv[1])
api_port = sys.argv[2]
text = p.read_text()
backup = p.with_suffix(p.suffix + ".bak." + datetime.now().strftime("%Y%m%d%H%M%S"))
backup.write_text(text)
old = """    location ^~ /api/ {
        default_type application/json;
        return 503 '{"error":"Betaflight mirror API not deployed yet"}';
    }
"""
new = f"""    location ^~ /api/ {{
        proxy_pass http://127.0.0.1:{api_port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

    location = /healthz {{
        proxy_pass http://127.0.0.1:{api_port};
        proxy_set_header Host $host;
    }}
"""
if old not in text:
    raise SystemExit("expected placeholder API block not found")
p.write_text(text.replace(old, new))
print(f"Backed up nginx vhost to {backup}")
PY
else
    echo "Nginx vhost does not contain the expected API proxy or placeholder block: $nginx_vhost" >&2
    exit 1
fi

nginx -t
systemctl reload nginx

ln -sfn "$site_root/releases/$release_id" "$site_root/current.next"
mv -Tf "$site_root/current.next" "$site_root/current"

cleanup_releases() {
    local releases_dir="$1"
    local protected_dir="$2"
    local keep="$3"
    local protected_real
    protected_real="$(readlink -f "$protected_dir" 2>/dev/null || true)"

    mapfile -t releases < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)

    local index=0
    for release in "${releases[@]}"; do
        index=$((index + 1))
        if (( index <= keep )); then
            continue
        fi

        if [[ -n "$protected_real" && "$(readlink -f "$release")" == "$protected_real" ]]; then
            echo "Skipping protected release $release"
            continue
        fi

        echo "Removing old release $release"
        rm -rf -- "$release"
    done
}

cleanup_releases "$site_root/releases" "$site_root/current" "$keep_releases"
cleanup_releases "$site_root/api/releases" "$site_root/api/releases/$release_id" "$keep_releases"

echo "Current static release: $(readlink -f "$site_root/current")"
docker ps --filter "name=$api_container" --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
REMOTE

echo "Verifying $SITE_URL"
curl -skI "$SITE_URL/" | sed -n "1,12p"
curl -sk "$SITE_URL/healthz"
echo
curl -sk "$SITE_URL/api/targets" | head -c 1000
echo
curl -sk "$SITE_URL/api/firmware/url?version=2025.12.2&target=SPEEDYBEEF405V3"
echo

echo "Deploy complete: $RELEASE_ID"
