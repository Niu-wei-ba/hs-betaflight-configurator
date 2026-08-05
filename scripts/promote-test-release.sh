#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: BFC_PROMOTE_CONFIRM=bf.hs-fpv.com $0 <test-release-id>" >&2
    exit 1
fi

RELEASE_ID="$1"
if ! [[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "Release id contains unsupported characters." >&2
    exit 1
fi

if [[ "${BFC_PROMOTE_CONFIRM:-}" != "bf.hs-fpv.com" ]]; then
    echo "Set BFC_PROMOTE_CONFIRM=bf.hs-fpv.com to promote a tested artifact." >&2
    exit 1
fi

SSH_HOST="${BFC_DEPLOY_SSH_HOST:-root@106.54.16.124}"
SSH_KEY="${BFC_DEPLOY_SSH_KEY:-/Users/lihao/Downloads/ssh.pem}"
TEST_SITE_ROOT="/www/wwwroot/betaflight.hs-fpv.com"
PRODUCTION_SITE_ROOT="/www/wwwroot/bf.hs-fpv.com"
KEEP_RELEASES="${BFC_PRODUCTION_KEEP_RELEASES:-5}"

if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || (( KEEP_RELEASES < 1 )); then
    echo "BFC_PRODUCTION_KEEP_RELEASES must be a positive integer." >&2
    exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
    echo "SSH key not found: $SSH_KEY" >&2
    exit 1
fi

ssh -i "$SSH_KEY" -o BatchMode=yes "$SSH_HOST" bash -s -- \
    "$RELEASE_ID" "$TEST_SITE_ROOT" "$PRODUCTION_SITE_ROOT" "$KEEP_RELEASES" <<'REMOTE'
set -euo pipefail

release_id="$1"
test_site_root="$2"
production_site_root="$3"
keep_releases="$4"
source_release="$test_site_root/releases/$release_id"
destination_release="$production_site_root/releases/$release_id"

if [[ ! -f "$source_release/index.html" ]]; then
    echo "Test artifact does not exist: $source_release" >&2
    exit 1
fi

if [[ "$(readlink -f "$test_site_root/current")" != "$(readlink -f "$source_release")" ]]; then
    echo "Refusing to promote an artifact that is not the active test release." >&2
    exit 1
fi

if [[ -e "$destination_release" ]]; then
    echo "Production release already exists: $destination_release" >&2
    exit 1
fi

mkdir -p "$destination_release"
cp -a "$source_release/." "$destination_release/"

if [[ ! -f "$destination_release/index.html" ]]; then
    rm -rf -- "$destination_release"
    echo "Copied production artifact is incomplete." >&2
    exit 1
fi

ln -sfn "$destination_release" "$production_site_root/current.next"
mv -Tf "$production_site_root/current.next" "$production_site_root/current"

mapfile -t releases < <(find "$production_site_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
current_release="$(readlink -f "$production_site_root/current")"
for index in "${!releases[@]}"; do
    release="${releases[$index]}"
    if (( index < keep_releases )) || [[ "$(readlink -f "$release")" == "$current_release" ]]; then
        continue
    fi
    rm -rf -- "$release"
done

printf 'Current production static release: %s\n' "$current_release"
REMOTE

curl -skI https://bf.hs-fpv.com/ | sed -n '1,12p'
curl -sk https://bf.hs-fpv.com/healthz
echo
curl -sk -o /dev/null -w 'API targets: %{http_code}\n' https://bf.hs-fpv.com/api/targets

echo "Promoted tested artifact to bf.hs-fpv.com: $RELEASE_ID"
