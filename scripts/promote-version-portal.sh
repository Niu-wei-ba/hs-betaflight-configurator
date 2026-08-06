#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: BFC_PROMOTE_CONFIRM=bf.hs-fpv.com $0 <test-portal-release-id>" >&2
    exit 1
fi
if [[ "${BFC_PROMOTE_CONFIRM:-}" != "bf.hs-fpv.com" ]]; then
    echo "Set BFC_PROMOTE_CONFIRM=bf.hs-fpv.com to promote a tested portal." >&2
    exit 1
fi

RELEASE_ID="$1"
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "Portal release id contains unsupported characters." >&2
    exit 1
fi

SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
TEST_ROOT="/www/wwwroot/betaflight.hs-fpv.com"
PRODUCTION_ROOT="/www/wwwroot/bf.hs-fpv.com"
if [[ ! -f "$SSH_KEY" ]]; then
    echo "SSH key not found: $SSH_KEY" >&2
    exit 1
fi

ssh -i "$SSH_KEY" -o BatchMode=yes "$SSH_HOST" bash -s -- "$TEST_ROOT" "$PRODUCTION_ROOT" "$RELEASE_ID" <<'REMOTE'
set -euo pipefail
test_root="$1"
production_root="$2"
release_id="$3"
source_release="$test_root/portal/releases/$release_id"
destination_release="$production_root/portal/releases/$release_id"

[[ -f "$source_release/index.html" ]]
[[ "$(readlink -f "$test_root/portal/current")" == "$(readlink -f "$source_release")" ]]
[[ ! -e "$destination_release" ]]
mkdir -p "$destination_release"
cp -a "$source_release/." "$destination_release/"
ln -sfn "$destination_release" "$production_root/portal/current.next"
mv -Tf "$production_root/portal/current.next" "$production_root/portal/current"
REMOTE

curl -skI https://bf.hs-fpv.com/ | sed -n '1,12p'
echo "Promoted version portal: $RELEASE_ID"
