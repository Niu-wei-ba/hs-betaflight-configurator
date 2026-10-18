# ESC melody development branch

## Production baseline

`codex/esc-melody-complete` starts at production commit
`9ad6f0f07b060239151934762e85fcb73179e2f9` on
`feature/betaflight-2026.6.1`. The active `/v/2026.6.1/` channel was verified
on 2026-10-18 as `web-2026.6.1-9ad6f0f0-20260923`.

This branch ports only ESC melody code and its integration dependencies.
It does not merge the Dev branch or change the production deployment.

## Included code

- Melody editor, piano roll, undo/redo, RTTTL import/export and preset tracks.
- Browser audio preview, including multichannel scheduling.
- Local drafts and draft file import/export.
- ESC 4-way discovery, firmware-family confirmation and layout checks.
- Current-melody reading, per-channel editing and sequential writing.
- EEPROM backup files/local history, read-back verification and restoration.
- Bluejay, AM32 and OX32 paths, including OX32 init recovery/checksum handling.
- AM32 NXP MCXA153 layout mapping; unknown layouts remain locked.
- Connected-state sidebar registration and MSP/4-way serial exclusion.
- Feature tests and third-party melody collection provenance notice.

## Port sources

- The ESC-only production-baseline port in commits `2dd6c65e`, `777e431f`,
  `3d33cce0` and `f19451ec` supplied the current Vue registration, dependency
  and serial integration. These commits were not merged as branch history.
- Feature files from `codex/esc-melody-mcxa153` at `88273b4b` supplied the
  later confirmation UI, disabled-write explanations and MCU layout support.
- The old branch's menu-disabling commit and unrelated sensor changes were
  not imported. The URL mock compatibility fix from `f19451ec` is retained.

## Development checks

Use Node 24 and install dependencies with `npm ci`.

```sh
npx vitest run test/js/audioPreview.test.js test/js/escMelody.test.js test/tabs/EscMelodyTab.test.js
npm run build
```

Initial consolidation verified on 2026-10-18 with Node 24: all 110 feature tests passed, ESLint
passed for imported JavaScript/Vue files and changed integration files, and
the production build succeeded. The build still reports existing legacy
CSS, Three.js export and chunking warnings outside this feature.

Review this branch against the production baseline, not against Dev:

```sh
git diff 9ad6f0f0...codex/esc-melody-complete
```

## Verification boundaries

Software tests do not certify physical ESC operation. MCXA153 configuration
sector erase/preservation, read/write/reboot behavior, interrupted writes and
backup restoration still require device-specific validation.

## Compatibility corrections

Verified on 2026-10-18 with Node 24: all 131 feature tests passed, changed
source/test files passed ESLint, and the production build succeeded.

- AM32 requires a complete, nonblank configuration header, boot marker 1,
  and a mapped EEPROM schema: versions 1/2 use 176 bytes; version 3 uses 192.
  Unknown schemas remain locked instead of being treated as version 3.
- Bluejay/AM32 reselect checks MCU signature, input pin, interface mode,
  firmware version/tag, configuration size and the recorded layout revision.
  Changed devices/layouts require a new scan and backup before normal writes.
- A write marks the channel touched before erase/write. Batch failure exposes
  all affected channels, including the failed first channel, for quick recovery.
  Their original backups cannot be overwritten until recovery completes.
- Recovery still checks the device fingerprint. If this operation erased the
  configuration header, recovery validates the retained original image rather
  than requiring the erased header to pass normal-write validation.
- Bluejay v0.21 executes delays as rest tuples inside the 128-byte melody.
  Delay participates in encoding/capacity checks for both Bluejay and AM32.
  Bluejay's 0xF0 delay bytes are retained as editor metadata, not interpreted
  as additional firmware playback delay. Decoding uses actual leading-rest
  milliseconds instead of potentially stale metadata.

BLHeli_32/unknown or unsupported layouts do not gain melody-write support.
No firmware migration, device flashing or production deployment is performed
by creating this branch.
