# BLHeli_32 support provenance and limits

The implemented profile is FPV32 / AT32F421, interface mode 4, device-info
signature 0x1506, bootloader marker 0x6E, firmware bytes [32,100], configuration
layout 0x30. Other BLHeli_32 hardware/versions remain locked. The signature alone
must not override AM32 MCXA153 detection (also 0x1506, with a different marker).

Evidence was collected on 2026-10-20 from the user's four-channel ESC and the
installed BLHeliSuite32xm 1.0.4.4 Mach-O, SHA256:
`de419d911f98c32cc12ef1eb79b9eeef22303b812c8a1b38dba07db6bedf25f0`.
REA 6.7.0 with Ghidra 12.1.4 was used for decompilation, with instructions and
Delphi RTTI used to check decompiler omissions. No official executable or
firmware image is included in this repository.

## Configuration transport

- Read cmd0x3A at 0x7C00, length256; decode to192 logical configuration bytes.
- Each8-byte block has2 random-prefix bytes and6 logical bytes. The selected
  branch uses32 rounds of address-dependent XTEA-like operations, with the
  address incrementing by8. It is not interchangeable with standard XTEA.
- Read decrypt: 0x100572AF0; prefix deletion: 0x100572800; encoding prefix
  insertion: 0x100572710; write encrypt: 0x100572900; dispatch: 0x100573040.
- Write192 logical bytes ->256 encoded bytes -> cmd0x3B at0x7C00. The official
  0x1006332A0 path for bootloader0x6E omits explicit page erase. No0x39 command
  is emitted by this implementation for this profile.
- Logical configuration snapshots and comparisons use192 bytes. Randomized
  read ciphertext can differ for identical settings. Imported backups contain
  decoded192 bytes, not ciphertext; recovery re-encodes them.
- Music mode is logical offset0x1C; notes are logical0x90..0xBF. Only those49
  bytes can change during a music edit. Physical Flash mapping and subrange
  addressing have not been established and are never guessed.

Evidence IDs:
- `ev_34a4c8590beb7d56bcc283015ab83faba9722b786d73a0074eab08c4ac83ba93` decrypt.
- `ev_cff37d11e41a7c13b47d54add014ee8cb0d2224be503eccca71b78c8fb01351f` encrypt.
- `ev_a2cd2f90aa26905937c4e2a465d999b734501d981fb6e6f38f2e79d8c9134f7c` random prefixes.
- `ev_276473f4a80aba0b33c8f1bc38b5d1bcc4f67d9b0a39adda9e26ace28126d8ab` write/erase branch.

## Music format

The parser0x100570330 and its tables at0x101067D20,0x101067F60,
0x101068230 and0x101068270 establish:

- Ordinary pitch byte = durationIndex<<6 | octaveIndex<<4 | pitchId.
- C4..B7, pitchIds0..11; octaveIndex0..3; denominator8/4/2/1 -> durationIndex0..3.
- Rests: denominators128/64/32/16 use pitchId13; 8/4/2/1 use pitchId12;
  both use octaveIndex3. Reserved forms are rejected rather than repaired.
- General Length is the high nibble, General Interval the low nibble;0xFF is
  Music Off. Length8 is neutral; interval0 means no added pause.
- Official preview durationMs = floor(floor(500/denominator)*max(length,1)/8);
  intervalMs = floor(durationMs*interval/32). The preview renderer0x100571850
  consumes that millisecond sound sequence (REA evidence
  `ev_379ce79f1d2c919c58d01a580635b2e419c38edf9fdae4afd313a8cfc6a9055d`).
- Editing searches the discrete length settings. Pitched-note deviations above
  max(1ms,5%) are rejected; accepted deviations above1ms are explicitly shown
  and browser preview plays the resulting encoded timing. Waiting/gaps consume
  native rest entries and thus share the48-byte capacity.
- Native loaded arrays/mode retain lossless metadata through unchanged edits;
  stale or forged metadata is decoded and checked before it can be reused.

## Music Off and pitch-edit changes (2026-10-26)

The saved REA observation of official UI handler0x1008516A0 sets both mode
nibbles to0xF when disabling music and restores the previous nibbles when
enabling it (Evidence `ev_46af966eec32e66fe8b4976423b6997e679aefbc133da13d0fd1251faec91dd8`).
The matching captured decoded fixtures have mode0xFF and48 note bytes0xFF.
The explicit off operation uses that captured pair. This is a software choice
based on static analysis and a captured off configuration, not an observed
official on-to-off wire transition or a physical write/playback acceptance run.
A non-off mode with an all0xFF array remains an empty sequence; firmware
equivalence with Music Off is not established.

Pitch-only edits reconstruct the decoded source timeline and native-byte
mapping, verify the stored fingerprint, and preserve mode, rest opcodes and
duration bits. Timing edits use the normal encoder with an explicit Interval
normalization warning. This does not provide a general interval-aware encoder.

The author's original investigation independently corroborates the layout and
read-decode branch:
https://elmagnifico.tech/2021/07/20/BLHeliSuite32-Reverse3/
https://elmagnifico.tech/2021/07/16/BLHeliSuite32-Reverse2/

Our article cross-check decoded11 captured wire blocks to the identical192-byte
configuration. The article's endian label and blanket256-byte configuration
wording are not followed: multibyte settings fields are little-endian and
logical length is192. The article's old object addresses/version validation
must not be transplanted to the current tool or firmware.

## Validation boundary

Captured vectors and independent-prefix reconstruction verify decoding and
encoding. Controller simulations cover whole-block transport, protected bytes,
randomized reads, dropped ACK retries, rollback, imported restore, strict
identity rejection and queued-command regression. Vue tests cover48-byte
capacity and B7 retention. This is not evidence of a physical music write or
power-cycle playback; a hardware write/readback/playback acceptance run remains
necessary before calling the feature hardware-validated.
