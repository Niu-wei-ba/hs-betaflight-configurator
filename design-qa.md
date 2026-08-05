# Archived ESC Melody Multi-Channel Design QA

## Evidence

- Source visual truth:
  - `/var/folders/_v/79603t3j0tn8kff9z53j6xzc0000gn/T/codex-clipboard-5971f514-16c1-4ca9-812b-77efdf1472b6.png`
  - `/var/folders/_v/79603t3j0tn8kff9z53j6xzc0000gn/T/codex-clipboard-bc778b1e-2bc7-442f-a630-f330bbc40d6f.png`
  - `/var/folders/_v/79603t3j0tn8kff9z53j6xzc0000gn/T/codex-clipboard-675f9af4-9c9c-4ee3-b44d-469fe09cba5a.png`
- Browser-rendered implementation:
  - `/tmp/esc-melody-main-qa-1440-fixed.png`
  - `/tmp/esc-melody-code-qa-1440.png`
  - `/tmp/esc-melody-code-qa-1024x550-fixed.png`
  - `/tmp/esc-melody-code-qa-720x700.png`
  - `/tmp/esc-melody-sync-hidden-qa-1440.png`
- Combined comparison inputs:
  - `/tmp/esc-melody-main-comparison.png`
  - `/tmp/esc-melody-code-comparison.png`
- Local URL: `http://127.0.0.1:8000/`

## Normalization

- Source pixels: `2836x714` for the roll reference and `1930x804` for the code matrix reference.
- Implementation pixels and CSS viewports: `1440x1024`, `1024x550`, and `720x700`.
- Browser density: CSS pixel screenshots at the browser default device scale.
- The sources are focused layout references rather than full Betaflight screens. They were resized to 1440 px wide and vertically combined with the corresponding implementation screenshot. The implementation intentionally retains the existing Betaflight shell, typography, density, and amber tokens.

## State

- Four identified, readable ESC channels using Bluejay, AM32, and OX32 display data.
- Synchronized editing with one shared RTTTL editor and per-target validation, plus split-channel editing with four independent editors.
- Current scanned melody available per channel.
- Four RTTTL entries in the batch code dialog, with each valid edit reflected in its channel's piano roll immediately.
- No serial scan, DShot command, 4-way operation, backup, or EEPROM write was executed.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the implementation keeps the existing Open Sans/Betaflight hierarchy and compact control sizing. RTTTL fields use a readable monospace stack. The larger reference typography was not copied because it conflicts with the existing application density.
- Spacing and layout rhythm: four ESC tabs fit at `1440x1024`; tabs scroll horizontally in the narrower workspace. The code matrix is two columns at desktop and `1024x550`, then one column below 760 px. Dialog header and footer remain fixed while its body scrolls.
- Colors and visual tokens: active/current states use the existing amber token; readable status and code validation use green; errors remain red. The palette is consistent with the surrounding configurator.
- Image and asset fidelity: the references contain no required raster assets. Existing Font Awesome controls are reused consistently with the application.
- Copy and content: channel, firmware, capacity, validation, current-music, synchronized/independent mode, simultaneous-preview, live-sync, and completion labels are visible and unambiguous.
- Interaction checks: mirrored synchronization toggles, one-to-many shared code, in-dialog mode switching, channel switching, current-music snapshot switching, code-to-roll live sync, roll-to-code regeneration, invalid-code preservation, simultaneous play, and unified stop were exercised in the browser.
- Synchronized channel visibility: with four writable channels and synchronization enabled, the piano-roll channel tabs and the `当前音乐` channel badge are hidden. Disabling synchronization immediately restores four channel tabs and the selected channel badge; the per-channel capability list remains visible for hardware safety context.
- Console check: one pre-existing localization error for `./locales/zh/messages.json` was present. The current `zh_CN` UI rendered correctly, and the error is outside this feature's changed surface.

## Comparison History

- Earlier P1: at `1024x550`, the global auto-connect toggle rendered above the modal overlay.
  - Fix: raised `.safety-overlay` from z-index 40 to 1000.
  - Post-fix evidence: `/tmp/esc-melody-code-qa-1024x550-fixed.png`; no global control is visible above the dialog.
- Earlier P2: the fourth common channel required horizontal scrolling at `1440x1024`.
  - Fix: reduced the stable channel-tab width from 76 px to 60 px while preserving scrolling for narrower workspaces and more channels.
  - Post-fix evidence: `/tmp/esc-melody-main-qa-1440-fixed.png`; all four tabs are visible and the document has no horizontal overflow.
- Earlier P1: RTTTL changes were held as a dialog draft until the user clicked an explicit apply action, so the code editor and piano roll could diverge.
  - Fix: valid RTTTL now updates the corresponding roll immediately, roll edits regenerate RTTTL, and invalid text keeps the last valid roll unchanged. A continuous code-editing session remains one undo step.
- Earlier P1: multiple readable ESCs always opened the channel matrix, even when all channels were configured to share one melody.
  - Fix: synchronized mode now shows one RTTTL editor with per-target firmware/capacity results; disabling synchronization expands the same dialog into independent channel editors.
- Earlier P2: synchronized mode still displayed per-channel ESC tabs and a single-channel badge on `当前音乐`, implying that the shared roll belonged to one ESC.
  - Fix: synchronized mode now hides both single-channel surfaces; independent mode restores them for channel switching and snapshot identification.

## Responsive Evidence

- `1440x1024`: document `clientWidth` and `scrollWidth` are both 1440; four tabs have `clientWidth=249` and `scrollWidth=249`.
- `1440x1024` synchronized mode: four-channel QA data renders with zero piano-roll channel tabs, zero current-music channel badges, and no horizontal overflow.
- `1024x550`: document has no horizontal overflow; `#content` provides vertical scrolling; the dialog body has `clientHeight=388` and `scrollHeight=482`.
- `720x700`: the code grid resolves to one `641.5px` column and the scrollable body contains all four channel cards.

## Follow-up Polish

- P3: a future pass could localize the English preset descriptions, but this is existing product copy and not specific to multi-channel editing.

historical result: passed

---

# ESC Melody Final UI Polish Design QA

## Evidence

- Source visual truth: `/var/folders/_v/79603t3j0tn8kff9z53j6xzc0000gn/T/codex-clipboard-15ac5501-2a88-4a5c-a33b-3a759603c727.png`
- Browser-rendered implementation:
  - `/tmp/esc-melody-ui-polish-1440-final3.png`
  - `/tmp/esc-melody-ui-polish-1024x550-final.png`
- Full-view comparison: `/tmp/esc-melody-ui-polish-comparison-final3.png`
- Focused component comparison: `/tmp/esc-melody-ui-polish-focus-comparison-final3.png`
- Local URL: `http://127.0.0.1:8000/`

## Normalization

- Source pixels: `3292x1494`; normalized to `1440px` width for comparison.
- Implementation pixels and CSS viewport: `1440x1024` and `1024x550`.
- The source is an annotated crop from a wider desktop layout. The focused comparison therefore judges the marked search, editor-toolbar, selected-note, and fixed-action components rather than expecting identical outer-shell proportions.

## State

- Offline editor with the four-part `Bad Apple` preset loaded.
- Four voice tabs visible, a selected pitched note shown in the inspector, and the fixed write action bar visible.
- Search typing, filtered result count, and clear-search interaction exercised.
- No serial scan, DShot command, backup, EEPROM write, or restore was executed.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: existing Open Sans and Betaflight type hierarchy are preserved; no text clips inside the normalized controls.
- Spacing and layout rhythm: search is a single 34px control; toolbar buttons are 30px; selected-note inputs and delete button share a baseline; fixed actions are uniformly `118x34px`.
- Colors and visual tokens: existing white, gray, amber, green, and red semantic tokens remain consistent with the configurator.
- Image and asset fidelity: the reference contains no new raster assets; existing Font Awesome icons are retained.
- Copy and content: labels and button copy are unchanged, so this visual pass does not alter workflows or safety meaning.
- Responsive behavior: no document, toolbar, inspector, or action-bar horizontal overflow at `1440x1024` or `1024x550`.
- Accessibility: keyboard focus outlines were added to button variants; the search field retains its accessible label and clear action.
- Console: only the pre-existing `./locales/zh/messages.json` parsing error was observed; the current `zh_CN` interface renders correctly and this error is outside the changed surface.

## Comparison History

- Earlier P2: the global form rule forced a gray 8px-rounded input inside the search wrapper, creating a visible double-frame component.
  - Fix: scoped `!important` overrides remove the inner border/background/radius while preserving the page-level search container.
  - Post-fix evidence: `/tmp/esc-melody-ui-polish-1440-final3.png`.
- Earlier P2: global button margins broke flex gaps and shifted the delete, toolbar, and fixed-action buttons off their intended baselines.
  - Fix: reset margins for all ESC melody button variants and define stable control heights.
  - Post-fix evidence: selected-note controls all end on the same y-coordinate in the final browser measurement.
- Earlier P2: only three of four voice tabs were visible at the `1440px` desktop viewport.
  - Fix: compacted track tabs and hides secondary note-count metadata at constrained editor widths.
  - Post-fix evidence: all four tabs are visible with `clientWidth === scrollWidth`.

## Follow-up Polish

- P3: imported preset descriptions remain partly English because they mirror the external library metadata.

final result: passed
