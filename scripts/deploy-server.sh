#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
SITE_URL="${BFC_DEPLOY_SITE_URL:-https://bf.hs-fpv.com}"
SITE_ROOT="${BFC_DEPLOY_SITE_ROOT:-/www/wwwroot/bf.hs-fpv.com}"
KEEP_RELEASES="${BFC_DEPLOY_KEEP_RELEASES:-5}"
NODE_VERSION="${BFC_DEPLOY_NODE_VERSION:-20.19.0}"
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

echo "Deploying frontend $RELEASE_ID to $SITE_URL"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use "$NODE_VERSION" >/dev/null
fi

VITE_SOURCE_CODE_URL="$VITE_SOURCE_CODE_URL" npm run build

ssh_server "mkdir -p '$SITE_ROOT/releases/$RELEASE_ID'"

rsync -az --delete -e "$RSYNC_SSH" \
    src/dist/ \
    "$SSH_HOST:$SITE_ROOT/releases/$RELEASE_ID/"

ssh_server bash -s -- \
    "$RELEASE_ID" \
    "$SITE_ROOT" \
    "$KEEP_RELEASES" <<'REMOTE'
set -euo pipefail

release_id="$1"
site_root="$2"
keep_releases="$3"

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

        echo "Removing old frontend release $release"
        rm -rf -- "$release"
    done
}

cleanup_releases "$site_root/releases" "$site_root/current" "$keep_releases"

echo "Current static release: $(readlink -f "$site_root/current")"
REMOTE

echo "Verifying $SITE_URL"
curl -skI "$SITE_URL/" | sed -n "1,12p"
curl -sk "$SITE_URL/healthz"
echo
curl -sk "$SITE_URL/api/targets" | head -c 1000
echo

echo "Frontend deploy complete: $RELEASE_ID"
