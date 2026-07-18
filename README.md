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
- `VITE_DEV_PROXY_TARGET` (local dev only; Vite proxy target for `/api`, `/healthz`, `/presets`, `/firmware-files`, `/docs`)
- `VITE_FIRMWARE_USE_VERSION_INDEX_FILTER` (optional; default off — full version list like official Betaflight; set `true` to restrict the dropdown to entries present in `/api/firmware/versions`)
- `VITE_PRESETS_OFFICIAL_URL`
- `VITE_PRESETS_BACKUP_URL`
- `VITE_DOCUMENTATION_LABEL`

Defaults assume same-origin mirror services for build APIs and preset hosting.

An example frontend environment file is available at [`.env.example`](/Users/lihao/Documents/betaflight-configurator/.env.example).

## Firmware API

Firmware metadata, Cloud Build fallback, upstream firmware proxying, and build-task state live in the private backend repository:

- `/Users/lihao/Documents/hs-betaflight-firmware-api`

This frontend talks to a Betaflight Build API-compatible service through same-origin routes by default. `VITE_BUILD_API_BASE_URL` is only needed when a deployment intentionally serves the frontend and build API from different origins. Firmware files are downloaded from the URL returned by that service; for HS-FPV deployments that URL is a same-origin backend proxy rather than an object-storage URL.

For **board and firmware version lists** to match [official Cloud Build API](https://betaflight.com/docs/development/API/Cloud-Build-API) behavior (`https://build.betaflight.com`), the mirror service should return the same payloads for `GET /api/targets` and `GET /api/targets/{target}` (e.g. periodic sync or reverse proxy + cache). The optional `GET /api/firmware/versions` route can supply channel metadata for labels; the UI no longer hides releases that are missing from that index unless `VITE_FIRMWARE_USE_VERSION_INDEX_FILTER=true`.

## Local Development

Use the local launcher to select Node 20, start the private firmware API when needed, start Vite, and verify the same-origin proxy:

```bash
yarn start:local
```

To use the production API while keeping the Configurator UI local, pass `-prod` through Yarn:

```bash
yarn start:local -- -prod
```

The launcher listens on `http://127.0.0.1:8000` by default. Copy [`scripts/local-dev.env.example`](/Users/lihao/Documents/betaflight-configurator/scripts/local-dev.env.example) to `.env.local-dev` to override the sibling API path, proxy targets, host, port, or Node 20 bin directory. `.env.local-dev` is intentionally ignored by Git. `yarn start:prod` is a shorthand for the production-proxy mode.

Useful checks:

```bash
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:8000/api/targets
curl "http://127.0.0.1:8000/api/firmware/url?version=2025.12.2&target=SPEEDYBEEF405V3"
```

## Presets

The presets page is retained. Default preset sources are expected to point to your mirror infrastructure rather than the official presets service.

## Privacy and Legal

This repository includes a mirror-specific privacy policy and help/legal page. Review them before deployment and update contact details if needed.

## License

This project remains distributed under GPLv3, consistent with the upstream Betaflight Configurator license.

## Source

Current fork repository:

- [https://github.com/Niu-wei-ba/hs-betaflight-configurator](https://github.com/Niu-wei-ba/hs-betaflight-configurator)
