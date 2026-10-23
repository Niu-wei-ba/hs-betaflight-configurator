# Captured BLHeli_32 configuration vectors

Captured read-only on2026-10-20 from the user's FPV32 / AT32F421 / BLHeli_32
32.10 (layout0x30), device signature0x1506, bootloader marker0x6E, interface4.
These configuration-only vectors contain no firmware image, device UUID,
license data or user-assigned ESC name. Music is Off (modeFF; all48 notesFF).

- raw-1.bin and raw-2.bin: two independent256-byte reads of0x7C00. Their
  ciphertext differs, while both decode to the same192-byte configuration.
- decoded-1.bin and decoded-2.bin: the matching independent decoded results.
- prefixes-1.bin:64 discarded bytes recovered by an independent Python
  reproduction of the official decrypt path from raw-1, used to check exact
  ciphertext reproduction rather than merely self-roundtripping the TS codec.

Decoded SHA256:
`4ffb96a6df187c8d7979db464ed6eb0b3981f89b4e318d3cbac1723a3313156a`.
See src/js/esc_melody/blheli32_config.sources.md for algorithm provenance,
selected binary identity, supported profile and remaining hardware limits.
