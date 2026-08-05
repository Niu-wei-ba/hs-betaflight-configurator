#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
SITE_URL="${BFC_TEST_SITE_URL:-https://betaflight.hs-fpv.com}"
SITE_ROOT="${BFC_TEST_SITE_ROOT:-/www/wwwroot/betaflight.hs-fpv.com}"
KEEP_RELEASES="${BFC_TEST_KEEP_RELEASES:-5}"
NODE_VERSION="${BFC_DEPLOY_NODE_VERSION:-20.19.0}"
VITE_SOURCE_CODE_URL="${VITE_SOURCE_CODE_URL:-https://github.com/Niu-wei-ba/hs-betaflight-configurator}"
RELEASE_ID="${BFC_TEST_RELEASE_ID:-test-$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"

if [[ "$SITE_URL" != "https://betaflight.hs-fpv.com" || "$SITE_ROOT" != "/www/wwwroot/betaflight.hs-fpv.com" ]]; then
    echo "Test deployment target overrides are not allowed." >&2
    exit 1
fi

if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || (( KEEP_RELEASES < 1 )); then
    echo "BFC_TEST_KEEP_RELEASES must be a positive integer." >&2
    exit 1
fi

if ! [[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "BFC_TEST_RELEASE_ID contains unsupported characters." >&2
    exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
    echo "SSH key not found: $SSH_KEY" >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Warning: deploying the current worktree, including uncommitted changes, to the test site." >&2
fi

SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes"

ssh_server() {
    ssh "${SSH_ARGS[@]}" "$SSH_HOST" "$@"
}

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use "$NODE_VERSION" >/dev/null
fi

echo "Building test frontend $RELEASE_ID for $SITE_URL"
VITE_SOURCE_CODE_URL="$VITE_SOURCE_CODE_URL" npm run build

ssh_server "mkdir -p '$SITE_ROOT/releases/$RELEASE_ID'"
rsync -az --delete -e "$RSYNC_SSH" \
    src/dist/ \
    "$SSH_HOST:$SITE_ROOT/releases/$RELEASE_ID/"

ssh_server bash -s -- "$RELEASE_ID" "$SITE_ROOT" "$KEEP_RELEASES" <<'REMOTE'
set -euo pipefail

release_id="$1"
site_root="$2"
keep_releases="$3"

ln -sfn "$site_root/releases/$release_id" "$site_root/current.next"
mv -Tf "$site_root/current.next" "$site_root/current"

mapfile -t releases < <(find "$site_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
current_release="$(readlink -f "$site_root/current")"
for index in "${!releases[@]}"; do
    release="${releases[$index]}"
    if (( index < keep_releases )) || [[ "$(readlink -f "$release")" == "$current_release" ]]; then
        continue
    fi
    rm -rf -- "$release"
done

printf 'Current test static release: %s\n' "$current_release"
REMOTE

echo "Verifying $SITE_URL"
curl -skI "$SITE_URL/" | sed -n '1,12p'
curl -sk "$SITE_URL/healthz"
echo
curl -sk -o /dev/null -w 'API targets: %{http_code}\n' "$SITE_URL/api/targets"

echo "Test frontend deploy complete: $RELEASE_ID"
