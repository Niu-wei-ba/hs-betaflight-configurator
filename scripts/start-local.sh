#!/usr/bin/env bash
# Start the Betaflight Configurator development environment.
#
# Default: start the private firmware API locally and proxy Vite requests to it.
# -prod:  start only Vite and proxy the same-origin API routes to production.
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_API_ROOT="$(cd "$PROJECT_ROOT/../hs-betaflight-firmware-api" 2>/dev/null && pwd || true)"
CONFIG_FILE="$PROJECT_ROOT/.env.local-dev"

MODE="local"
START_API=true
FRONTEND_PID=""
API_PID=""
API_STARTED_BY_SCRIPT=false

usage() {
    cat <<'USAGE'
Usage: yarn start:local [options]

Options:
  -prod, --prod       Proxy local Vite requests to https://bf.hs-fpv.com.
                      The local firmware API is not started in this mode.
  --frontend-only     Start Vite only, using BFC_LOCAL_API_URL as its proxy target.
  -h, --help          Show this help.

Optional local configuration: copy scripts/local-dev.env.example to .env.local-dev.
USAGE
}

for argument in "$@"; do
    case "$argument" in
        -prod|--prod)
            MODE="prod"
            START_API=false
            ;;
        --frontend-only)
            START_API=false
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $argument" >&2
            usage >&2
            exit 2
            ;;
    esac
done

# .env.local-dev is deliberately local-only and may contain developer-specific paths.
if [[ -f "$CONFIG_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    set +a
fi

BFC_LOCAL_API_DIR="${BFC_LOCAL_API_DIR:-$DEFAULT_API_ROOT}"
BFC_LOCAL_API_URL="${BFC_LOCAL_API_URL:-http://127.0.0.1:4180}"
BFC_PROD_API_URL="${BFC_PROD_API_URL:-https://bf.hs-fpv.com}"
BFC_DEV_HOST="${BFC_DEV_HOST:-127.0.0.1}"
BFC_DEV_PORT="${BFC_DEV_PORT:-8000}"
NODE20_BIN="${BFC_NODE20_BIN:-$HOME/.nvm/versions/node/v20.20.2/bin}"

ensure_node20() {
    if [[ -x "$NODE20_BIN/node" ]]; then
        export PATH="$NODE20_BIN:$PATH"
    elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        # shellcheck disable=SC1090
        source "$HOME/.nvm/nvm.sh"
        nvm use 20 >/dev/null
    fi

    if ! command -v node >/dev/null 2>&1 || ! command -v yarn >/dev/null 2>&1; then
        echo "Node.js and Yarn are required. Install Node 20.x and Yarn first." >&2
        exit 1
    fi

    local major
    major="$(node -p 'process.versions.node.split(".")[0]')"
    if [[ "$major" != "20" ]]; then
        echo "This project requires Node 20.x, but found $(node -v)." >&2
        echo "Set BFC_NODE20_BIN or install Node 20 with nvm, then retry." >&2
        exit 1
    fi
}

ensure_dependencies() {
    local directory="$1"
    if [[ ! -d "$directory/node_modules" ]]; then
        echo "Installing dependencies in $directory …"
        (cd "$directory" && yarn install --immutable)
    fi
}

is_port_listening() {
    local port="$1"
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

is_url_ready() {
    curl --fail --silent --max-time 2 "$1" >/dev/null
}

wait_for_url() {
    local url="$1"
    local label="$2"
    local attempts="${3:-40}"
    local watched_pid="${4:-}"

    for ((attempt = 1; attempt <= attempts; attempt += 1)); do
        if curl --fail --silent --max-time 2 "$url" >/dev/null; then
            return 0
        fi
        if [[ -n "$watched_pid" ]] && ! kill -0 "$watched_pid" 2>/dev/null; then
            echo "$label exited before it became ready." >&2
            return 1
        fi
        sleep 0.5
    done

    echo "$label did not become ready: $url" >&2
    return 1
}

resolve_local_api_binding() {
    local result
    result="$(node --input-type=module - "$BFC_LOCAL_API_URL" <<'NODE'
const value = process.argv[2];
const url = new URL(value);
if (url.protocol !== "http:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BFC_LOCAL_API_URL must be an http://host:port origin when the launcher starts the local API.");
}
console.log(`${url.hostname}\t${url.port || 80}`);
NODE
)" || {
        echo "Invalid BFC_LOCAL_API_URL: $BFC_LOCAL_API_URL" >&2
        exit 1
    }
    BFC_LOCAL_API_HOST="${result%%$'\t'*}"
    BFC_LOCAL_API_PORT="${result#*$'\t'}"
}

cleanup() {
    local exit_code="$?"
    trap - EXIT INT TERM

    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi

    if [[ "$API_STARTED_BY_SCRIPT" == true ]] && [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
        kill "$API_PID" 2>/dev/null || true
        wait "$API_PID" 2>/dev/null || true
    fi

    exit "$exit_code"
}

trap cleanup EXIT INT TERM

ensure_node20
ensure_dependencies "$PROJECT_ROOT"

if [[ "$MODE" == "prod" ]]; then
    PROXY_TARGET="$BFC_PROD_API_URL"
    PROXY_CHANGE_ORIGIN=true
    echo "Mode: production proxy ($PROXY_TARGET)"
else
    PROXY_TARGET="$BFC_LOCAL_API_URL"
    PROXY_CHANGE_ORIGIN=false
    echo "Mode: local API proxy ($PROXY_TARGET)"

    if [[ "$START_API" == true ]]; then
        resolve_local_api_binding
        if [[ -z "$BFC_LOCAL_API_DIR" || ! -f "$BFC_LOCAL_API_DIR/package.json" ]]; then
            echo "Local firmware API repository was not found: $BFC_LOCAL_API_DIR" >&2
            echo "Set BFC_LOCAL_API_DIR in .env.local-dev, or use -prod." >&2
            exit 1
        fi

        if is_url_ready "$BFC_LOCAL_API_URL/healthz"; then
            echo "Reusing local firmware API already listening at $BFC_LOCAL_API_URL"
        else
            ensure_dependencies "$BFC_LOCAL_API_DIR"
            echo "Starting local firmware API from $BFC_LOCAL_API_DIR …"
            (
                cd "$BFC_LOCAL_API_DIR"
                if [[ -f .env ]]; then
                    set -a
                    # The private API supports environment-based configuration. Keep those
                    # values in its local-only .env file, never in this frontend repository.
                    # shellcheck disable=SC1091
                    source .env
                    set +a
                fi
                exec env HOST="$BFC_LOCAL_API_HOST" PORT="$BFC_LOCAL_API_PORT" yarn firmware:api
            ) &
            API_PID="$!"
            API_STARTED_BY_SCRIPT=true
            wait_for_url "$BFC_LOCAL_API_URL/healthz" "Local firmware API" 40 "$API_PID"
        fi
    fi
fi

if is_port_listening "$BFC_DEV_PORT"; then
    echo "Port $BFC_DEV_PORT is already in use." >&2
    lsof -nP -iTCP:"$BFC_DEV_PORT" -sTCP:LISTEN >&2 || true
    echo "Stop the existing Vite process or choose BFC_DEV_PORT in .env.local-dev." >&2
    exit 1
fi

echo "Starting Vite at http://$BFC_DEV_HOST:$BFC_DEV_PORT"
echo "Proxy target: $PROXY_TARGET"
(
    cd "$PROJECT_ROOT"
    exec env \
        VITE_DEV_PROXY_TARGET="$PROXY_TARGET" \
        VITE_DEV_PROXY_CHANGE_ORIGIN="$PROXY_CHANGE_ORIGIN" \
        VITE_DEV_HOST="$BFC_DEV_HOST" \
        VITE_DEV_PORT="$BFC_DEV_PORT" \
        yarn dev --host "$BFC_DEV_HOST" --port "$BFC_DEV_PORT"
) &
FRONTEND_PID="$!"

wait_for_url "http://$BFC_DEV_HOST:$BFC_DEV_PORT/healthz" "Vite proxy" 40 "$FRONTEND_PID"

if [[ "$MODE" == "prod" ]]; then
    wait_for_url "http://$BFC_DEV_HOST:$BFC_DEV_PORT/api/tutorials/catalog" "Production tutorial catalog proxy"
fi

echo
echo "Ready: http://$BFC_DEV_HOST:$BFC_DEV_PORT"
echo "Press Ctrl+C to stop the development environment."
wait "$FRONTEND_PID"
