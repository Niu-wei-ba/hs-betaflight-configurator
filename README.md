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

## Presets

The presets page is retained. Default preset sources are expected to point to your mirror infrastructure rather than the official presets service.

## Privacy and Legal

This repository includes a mirror-specific privacy policy and help/legal page. Review them before deployment and update contact details if needed.

## License

This project remains distributed under GPLv3, consistent with the upstream Betaflight Configurator license.

## Source

Current fork repository:
- [https://github.com/Niu-wei-ba/betaflight-configurator](https://github.com/Niu-wei-ba/betaflight-configurator)
