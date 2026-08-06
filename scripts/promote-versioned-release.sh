#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=version-release-config.sh
source "$PROJECT_ROOT/scripts/version-release-config.sh"

if [[ $# -ne 2 ]]; then
    echo "Usage: BFC_PROMOTE_CONFIRM=bf.hs-fpv.com $0 <2025.12.2|2026.6.1> <test-release-id>" >&2
    exit 1
fi
if [[ "${BFC_PROMOTE_CONFIRM:-}" != "bf.hs-fpv.com" ]]; then
    echo "Set BFC_PROMOTE_CONFIRM=bf.hs-fpv.com to promote a tested artifact." >&2
    exit 1
fi

bfc_configure_version_channel "$1"
RELEASE_ID="$2"
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "Release id contains unsupported characters." >&2
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

ssh -i "$SSH_KEY" -o BatchMode=yes "$SSH_HOST" bash -s -- "$TEST_ROOT" "$PRODUCTION_ROOT" "$BFC_VERSION_CHANNEL" "$RELEASE_ID" <<'REMOTE'
set -euo pipefail
test_root="$1"
production_root="$2"
channel="$3"
release_id="$4"
source_release="$test_root/apps/$channel/releases/$release_id"
destination_root="$production_root/apps/$channel"
destination_release="$destination_root/releases/$release_id"

[[ -f "$source_release/index.html" ]]
[[ "$(readlink -f "$test_root/apps/$channel/current")" == "$(readlink -f "$source_release")" ]]
[[ ! -e "$destination_release" ]]
mkdir -p "$destination_release"
cp -a "$source_release/." "$destination_release/"
ln -sfn "$destination_release" "$destination_root/current.next"
mv -Tf "$destination_root/current.next" "$destination_root/current"
REMOTE

curl -skI "https://bf.hs-fpv.com/v/$BFC_VERSION_CHANNEL/" | sed -n '1,12p'
curl -sk -o /dev/null -w 'API targets: %{http_code}\n' "https://bf.hs-fpv.com/api/targets"
echo "Promoted Configurator $BFC_VERSION_CHANNEL: $RELEASE_ID"
