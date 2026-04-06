# HS-FPV | Betaflight镜像站

HS-FPV | Betaflight镜像站 is a mirror-focused Betaflight-compatible configurator based on the `2025.12.2` release line.

## Scope

This fork keeps the full flight-controller workflow, including:

- firmware flashing
- presets
- configuration and tuning tabs
- privacy policy and legal/help pages

This fork removes or disables these external dependencies from the default deployment:

- sponsor tiles
- third-party analytics
- official community redirects in the main help flow

## Mirror Configuration

The deployment is configured through Vite environment variables:

- `VITE_APP_NAME`
- `VITE_APP_TAGLINE`
- `VITE_SOURCE_CODE_URL`
- `VITE_DOCS_BASE_URL`
- `VITE_BUILD_API_BASE_URL`
- `VITE_PRESETS_OFFICIAL_URL`
- `VITE_PRESETS_BACKUP_URL`
- `VITE_DOCUMENTATION_LABEL`

Defaults assume same-origin mirror services for build APIs and preset hosting.

An example frontend environment file is available at [`.env.example`](/Users/lihao/Documents/betaflight-configurator/.env.example).

## Firmware Distribution Phase One

This repository now includes the first implementation layer for the firmware mirror workflow:

- hot-set manifest source
- metadata generation script
- firmware artifact mirror script
- GitHub Actions metadata sync workflow
- metadata-backed local firmware API
- standalone firmware API backed by COS or local artifact bundles

Key files:

- [Phase One API doc](/Users/lihao/Documents/betaflight-configurator/docs/phase-one-firmware-api.md)
- [Phase One manifest](/Users/lihao/Documents/betaflight-configurator/resources/firmware-mirror/phase-one-manifest.json)
- [Metadata generator](/Users/lihao/Documents/betaflight-configurator/scripts/generate-firmware-metadata.mjs)
- [Firmware artifact mirror](/Users/lihao/Documents/betaflight-configurator/scripts/mirror-firmware-artifacts.mjs)
- [Firmware API adapter](/Users/lihao/Documents/betaflight-configurator/scripts/firmware-api-adapter.mjs)
- [Standalone firmware API server](/Users/lihao/Documents/betaflight-configurator/scripts/serve-firmware-api.mjs)
- [Remote metadata sync](/Users/lihao/Documents/betaflight-configurator/scripts/sync-firmware-metadata.mjs)
- [Metadata sync workflow](/Users/lihao/Documents/betaflight-configurator/.github/workflows/firmware-metadata-sync.yml)

## Local Development

### Option 1: Standalone firmware API

Use this when you want the frontend to call an actual local backend service:

Terminal 1:

```bash
nvm use
yarn install
yarn firmware:metadata
yarn firmware:api
```

Terminal 2:

```bash
nvm use
VITE_BUILD_API_BASE_URL=http://127.0.0.1:4180 yarn dev
```

Useful checks:

```bash
curl http://127.0.0.1:4180/healthz
curl http://127.0.0.1:4180/api/targets
curl "http://127.0.0.1:4180/api/firmware/url?version=2025.12.2&target=SPEEDYBEEF405V3"
```

### Option 2: Standalone firmware API with COS metadata

Use this after `Firmware Metadata Sync` has uploaded the metadata bundle to COS:

```bash
nvm use
yarn install
FIRMWARE_METADATA_BASE_URL=https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/mirror-metadata \
FIRMWARE_ARTIFACT_BASE_URL=https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com \
yarn firmware:api
```

At startup, the API downloads `manifest.json`, `index/*.json`, `targets/*.json`, and `builds/*/*.json` into `artifacts/firmware-metadata/`, then serves the normal `/api/*` interface from that local cache.

`FIRMWARE_ARTIFACT_BASE_URL` is used with each metadata `artifact.objectKey`, so `/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex` becomes `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex`.

### Metadata Generation

Generate the current metadata bundle locally:

```bash
yarn firmware:metadata
```

Output is written to `artifacts/firmware-metadata/`.

Sync the metadata bundle from COS/CDN without starting the API:

```bash
FIRMWARE_METADATA_BASE_URL=https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/mirror-metadata yarn firmware:metadata:sync
```

Mirror firmware artifacts declared in the manifest:

```bash
yarn firmware:artifacts
```

By default this requests official Betaflight Cloud Build with `CORE_BUILD` for each manifest target and writes files under `artifacts/firmware-files/`. For older releases with GitHub release assets, set a target `source.type` to `github-release-asset` or `url` in the manifest.

Important: manifest `target` values must be official Betaflight target IDs from `betaflight/config`. Run `npm run firmware:manifest:validate` before enabling firmware artifact mirroring in GitHub Actions.

## Presets

The presets page is retained. Default preset sources are expected to point to your mirror infrastructure rather than the official presets service.

## Privacy and Legal

This repository includes a mirror-specific privacy policy and help/legal page. Review them before deployment and update contact details if needed.

## License

This project remains distributed under GPLv3, consistent with the upstream Betaflight Configurator license.

## Source

Current fork repository:

- [https://github.com/Niu-wei-ba/hs-betaflight-configurator](https://github.com/Niu-wei-ba/hs-betaflight-configurator)
