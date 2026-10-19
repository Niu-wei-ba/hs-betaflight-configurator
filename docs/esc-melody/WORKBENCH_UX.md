# ESC music workbench: three UX rounds

Branch: `codex/esc-melody-complete`, built on the production baseline.

## Round 1 — evidence and targets

- Encoding validity is distinct from connected-device verification and operation readiness.
- Bluejay and AM32 waits consume melody capacity; no “native wait” playback claim.
- A persistent voice/channel table includes unparticipating channels, per-channel capacity and manual voice assignment. Missing/repeated voices and excluded channels require acknowledgment in the write checklist.
- Write/read-back/recovery progress includes failed first channels and channels not executed. Pending recovery prevents replacing the session by rescanning or overwriting backups.

## Round 2 — editing and operation flow

- Fixed pixels per beat, zoom, fit-to-song, beat/second ruler, selected-note location, playback cursor/follow, configurable snapping and explicit select/note/rest tools.
- Note duration controls its true width. Arrow keys move notes, Alt+Left/Right select neighboring notes, Delete removes the selection. An expandable event table provides exact timing edits.
- Current-voice and ensemble preview share a volume/mute output. Computer preview does not send ESC commands. Asynchronous audio startup cannot relabel or stop a newer preview.
- Modal dialogs manage focus, trap Tab, return focus and support Escape when idle. Unsaved RTTTL edits require an explicit discard; hardware operations cannot be dismissed while busy.
- Desktop editor gets priority space; supporting device panels move below when constrained. Narrow layouts switch between editor, library and device views. The footer occupies one action row on mobile.

## Round 3 — library and offline access

- Offline navigation, quick-start actions and workflow state support editing before connecting.
- Independent library audition does not load or replace the current arrangement. Search combines with favorite/recent and solo/polyphonic filters.
- Favorites and the last twelve loaded presets persist locally. Invalid or stale IDs are ignored.
- Switching sources preserves edited arrangements, including BPM/wait-only edits and all voices. Recovery/export contains melodies only, never device identity or EEPROM data. Recovery has explicit size/voice limits and does not silently truncate.
- The arrangement control distinguishes same-melody sync, polyphonic presets and independent channels. Switching from polyphony preserves the previous arrangement before applying a new mode.
- Failed EEPROM import/recovery retains per-channel results and can be reopened for rollback.

## Validation

Use Node 24. New TypeScript tests are included by Vitest; the new JavaScript-compatible TypeScript module/test paths also use existing ESLint rules.

```sh
npx vitest run test/js/audioPreview.test.js test/js/escMelody.test.js test/js/escWorkbench.test.ts test/tabs/EscMelodyTab.test.js test/js/sidebar_items.test.js test/js/vue_tab_mounter.test.js
npm run build
```

Browser checks use the actual app sidebar at 1366×768, 1280×720 and 390×844. Confirm no page-level horizontal overflow, offline entry, polyphonic tabs, library filters, modal keyboard closure and responsive workspace navigation.

Hardware scan, power behavior, erase/write/read-back and physical recovery still require real Bluejay/AM32/OX32 ESC validation. Simulated progress tests do not certify hardware operation.
