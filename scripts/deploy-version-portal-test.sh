#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTAL_SOURCE="$PROJECT_ROOT/deploy/version-portal"
SITE_URL="${BFC_TEST_SITE_URL:-https://betaflight.hs-fpv.com}"
SITE_ROOT="${BFC_TEST_SITE_ROOT:-/www/wwwroot/betaflight.hs-fpv.com}"
SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
RELEASE_ID="${BFC_PORTAL_TEST_RELEASE_ID:-portal-$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"

if [[ "$SITE_URL" != "https://betaflight.hs-fpv.com" || "$SITE_ROOT" != "/www/wwwroot/betaflight.hs-fpv.com" ]]; then
    echo "Test deployment target overrides are not allowed." >&2
    exit 1
fi
if [[ ! -f "$PORTAL_SOURCE/index.html" || ! -f "$SSH_KEY" ]]; then
    echo "Portal source or SSH key is missing." >&2
    exit 1
fi

SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes"
ssh "${SSH_ARGS[@]}" "$SSH_HOST" "mkdir -p '$SITE_ROOT/portal/releases/$RELEASE_ID'"
rsync -az --delete -e "$RSYNC_SSH" "$PORTAL_SOURCE/" "$SSH_HOST:$SITE_ROOT/portal/releases/$RELEASE_ID/"
ssh "${SSH_ARGS[@]}" "$SSH_HOST" bash -s -- "$SITE_ROOT" "$RELEASE_ID" <<'REMOTE'
set -euo pipefail
site_root="$1"
release="$site_root/portal/releases/$2"
[[ -f "$release/index.html" ]]
ln -sfn "$release" "$site_root/portal/current.next"
mv -Tf "$site_root/portal/current.next" "$site_root/portal/current"
REMOTE
curl -skI "$SITE_URL/" | sed -n '1,12p'
echo "Portal test deployment complete: $RELEASE_ID"
