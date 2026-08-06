#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=version-release-config.sh
source "$PROJECT_ROOT/scripts/version-release-config.sh"

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <2025.12.2|2026.6.1>" >&2
    exit 1
fi

bfc_configure_version_channel "$1"
SOURCE_WORKTREE="${BFC_VERSION_WORKTREE:-$BFC_VERSION_WORKTREE_DEFAULT}"
BUILD_OUTPUT="$SOURCE_WORKTREE/$BFC_VERSION_BUILD_OUTPUT_REL"
SITE_URL="${BFC_TEST_SITE_URL:-https://betaflight.hs-fpv.com}"
SITE_ROOT="${BFC_TEST_SITE_ROOT:-/www/wwwroot/betaflight.hs-fpv.com}"
KEEP_RELEASES="${BFC_TEST_KEEP_RELEASES:-5}"
SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
VITE_SOURCE_CODE_URL="${VITE_SOURCE_CODE_URL:-https://github.com/Niu-wei-ba/hs-betaflight-configurator}"

if [[ "$SITE_URL" != "https://betaflight.hs-fpv.com" || "$SITE_ROOT" != "/www/wwwroot/betaflight.hs-fpv.com" ]]; then
    echo "Test deployment target overrides are not allowed." >&2
    exit 1
fi
if [[ ! -d "$SOURCE_WORKTREE/.git" && ! -f "$SOURCE_WORKTREE/.git" ]]; then
    echo "Version worktree not found: $SOURCE_WORKTREE" >&2
    exit 1
fi
if [[ "$(git -C "$SOURCE_WORKTREE" branch --show-current)" != "$BFC_VERSION_BRANCH" ]]; then
    echo "Refusing to deploy from $(git -C "$SOURCE_WORKTREE" branch --show-current); expected $BFC_VERSION_BRANCH." >&2
    exit 1
fi
if [[ -n "$(git -C "$SOURCE_WORKTREE" status --porcelain)" ]]; then
    echo "Warning: deploying uncommitted changes from $SOURCE_WORKTREE." >&2
fi
if [[ ! "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || (( KEEP_RELEASES < 1 )); then
    echo "BFC_TEST_KEEP_RELEASES must be a positive integer." >&2
    exit 1
fi
if [[ ! -f "$SSH_KEY" ]]; then
    echo "SSH key not found: $SSH_KEY" >&2
    exit 1
fi

RELEASE_ID="${BFC_TEST_RELEASE_ID:-web-${BFC_VERSION_CHANNEL}-$(git -C "$SOURCE_WORKTREE" rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "BFC_TEST_RELEASE_ID contains unsupported characters." >&2
    exit 1
fi

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use "$BFC_VERSION_NODE" >/dev/null
fi

echo "Building Configurator $BFC_VERSION_CHANNEL as $RELEASE_ID"
(
    cd "$SOURCE_WORKTREE"
    VITE_BUILD_API_BASE_URL=/ VITE_SOURCE_CODE_URL="$VITE_SOURCE_CODE_URL" VITE_VERSION_PORTAL_URL="/?version-picker=1" VITE_WEB_BASE_PATH="/v/$BFC_VERSION_CHANNEL/" npm run build
)
if [[ ! -f "$BUILD_OUTPUT/index.html" ]]; then
    echo "Expected build output is missing: $BUILD_OUTPUT/index.html" >&2
    exit 1
fi

SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes"
ssh "${SSH_ARGS[@]}" "$SSH_HOST" "mkdir -p '$SITE_ROOT/apps/$BFC_VERSION_CHANNEL/releases/$RELEASE_ID'"
rsync -az --delete -e "$RSYNC_SSH" \
    "$BUILD_OUTPUT/" \
    "$SSH_HOST:$SITE_ROOT/apps/$BFC_VERSION_CHANNEL/releases/$RELEASE_ID/"

ssh "${SSH_ARGS[@]}" "$SSH_HOST" bash -s -- "$SITE_ROOT" "$BFC_VERSION_CHANNEL" "$RELEASE_ID" "$KEEP_RELEASES" <<'REMOTE'
set -euo pipefail
site_root="$1"
channel="$2"
release_id="$3"
keep_releases="$4"
app_root="$site_root/apps/$channel"
release_root="$app_root/releases"
release="$release_root/$release_id"

[[ -f "$release/index.html" ]]
ln -sfn "$release" "$app_root/current.next"
mv -Tf "$app_root/current.next" "$app_root/current"
mapfile -t releases < <(find "$release_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
for index in "${!releases[@]}"; do
    if (( index >= keep_releases )) && [[ "$(readlink -f "${releases[$index]}")" != "$(readlink -f "$app_root/current")" ]]; then
        rm -rf -- "${releases[$index]}"
    fi
done
REMOTE

curl -skI "$SITE_URL/v/$BFC_VERSION_CHANNEL/" | sed -n '1,12p'
curl -sk "$SITE_URL/healthz"
curl -sk -o /dev/null -w 'API targets: %{http_code}\n' "$SITE_URL/api/targets"
echo "Test deployment complete: $RELEASE_ID"
