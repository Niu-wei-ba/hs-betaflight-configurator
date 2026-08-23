#!/usr/bin/env bash

bfc_configure_version_channel() {
    case "$1" in
        2025.12.2)
            BFC_VERSION_CHANNEL="2025.12.2"
            BFC_VERSION_BRANCH="feature/betaflight-2025.12.2"
            BFC_VERSION_WORKTREE_DEFAULT="/Users/lihao/Documents/betaflight-configurator-2025.12.2"
            BFC_VERSION_NODE="20.19.0"
            BFC_VERSION_BUILD_OUTPUT_REL="src/dist"
            ;;
        2026.6.1)
            BFC_VERSION_CHANNEL="2026.6.1"
            BFC_VERSION_BRANCH="feature/betaflight-2026.6.1-dev"
            BFC_VERSION_WORKTREE_DEFAULT="/Users/lihao/Documents/betaflight-configurator-2026.6.1-dev"
            BFC_VERSION_NODE="24"
            BFC_VERSION_BUILD_OUTPUT_REL="src/dist"
            ;;
        *)
            echo "Unsupported Configurator version '$1'. Supported versions: 2025.12.2, 2026.6.1." >&2
            return 1
            ;;
    esac
}
