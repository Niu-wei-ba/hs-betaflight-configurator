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

## OX32 initialization readiness

Interface Alive replies do not prove that an ESC is ready for flash access.
An Alive ACK `0x0F` preserves the session's settling wait. If Alive returns OK
but initialization still returns `0x0F`, the controller waits for the remaining
startup window and retries in the same session before considering recovery.
An ESC that initializes immediately retains the fast path.

On 2026-10-21, the production controller modules passed a four-channel scan and
two rounds of pre-write selection/configuration snapshots on SpeedyBee 25A AIO
OX32 1.14 / IO02 3.00. All twelve initializations succeeded and configuration
hashes/checksums were unchanged. This validation sent no reset, erase or write
commands; physical music writing and playback were not tested in this run.

## BLHeli_32 melody adaptation

After a writable BLHeli_32 channel is detected, compatibility is evaluated
without a manual adaptation button. Already compatible music stays unchanged.
Otherwise the adapter searches a uniform octave shift, tempo ratio and native
length setting across the complete arrangement. Only a complete successful
result is used for selection preview, audio, capacity checks, channel planning
and the write provider. Original editor data, presets and local drafts remain
unchanged; adaptation does not create drafts or write to hardware automatically.

Automatic adaptation never crops a song or deletes notes. Arrangements which
cannot fit all voices within 48 encoded events and 30 ms timeline deviation
remain incompatible with BL32, and the existing safety flow blocks writing.
Native bytes/mode and non-BL32-only arrangements are preserved. Mixed-firmware
arrangements use the same transformed voices to retain their pitch and timing
relationships. Existing hardware profile checks, recovery and read-back
verification remain required.

The current 108-song library has 18 songs whose complete original arrangements
pass BL32 encoding; offline adaptation without cropping produces 48 complete
arrangements. These are software encoding results, not physical playback or
hardware-write acceptance.

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

## Three-round UI/UX optimization

See [WORKBENCH_UX.md](WORKBENCH_UX.md) for readiness/voice allocation, timeline
and keyboard editing, operation progress, library browsing and offline workflows.
Final verification on 2026-10-19 with Node 24: 164 tests passed, all changed
JavaScript/Vue and the new TypeScript module/test paths passed ESLint, and the
production build succeeded. Existing unrelated build warnings remain.
Actual application browser checks covered 1366×768, 1280×720, 390×844, light/dark
themes, offline entry, library favorites/filtering, polyphonic tabs and Escape
closure. Hardware scan/write/recovery remains pending real-device validation.

## Review corrections (2026-10-22)

- Imported EEPROM restores validate the payload before erasing or writing:
  Bluejay/AM32 headers must match the detected version and layout, Bluejay target
  and MCU tags must match the selected channel, and OX32 settings must match the
  saved CRC. BLHeli_32 retains its existing verified-profile checks.
- Initial 4-way setup failures release the partial session and attempt to return
  the flight controller to MSP. Refresh/close prompts cover active writes,
  restores and channels still requiring recovery.
- Successful polyphonic writes update the working voice session to the written
  output. Automatic adaptation changes participate in deciding which channels
  need writing, and changing the viewed voice leaves completed output intact.
- Saving unchanged RTTTL text preserves native BLHeli_32 bytes and timing in
  single, independent-channel and polyphonic editors.
- Duplicate draft names reserve space for their numeric suffix before checking
  uniqueness, including names already at the 32-character limit.
- The sidebar and navigation allow ESC music only after flight-controller
  connection. The corresponding browser-state test follows this requirement.

The relevant software suite passes 273 tests across 14 files. Hardware writes,
interrupted-write recovery and power-cycle playback still require device tests.
