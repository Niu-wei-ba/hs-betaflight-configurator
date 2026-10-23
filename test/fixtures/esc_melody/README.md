# Bluejay identification fixture

`bluejay-B_X_30_24-v0.19.2-application.bin` contains bytes `0x0000–0x2FFF`
from the official [B_X_30_24_v0.19.2.hex release](https://github.com/bird-sanctuary/bluejay/releases/download/v0.19.2/B_X_30_24_v0.19.2.hex).
Intel HEX checksums were checked and unoccupied bytes filled with `FF`.
The mutable pseudo-EEPROM and bootloader are excluded. No user configuration is included.

- HEX file SHA-256: `c9748a3187eb9ccd911fe424099fd5938263c30eed9f3c65ae166b2f42f70b4e`
- Application SHA-256: `917ce9396f6f1a35952a45de563e5882f6fcd86c3eb06c29c0ae68473f9886d1`
- Firmware: Bluejay v0.19.2, EFM8BB51, B_X_30, 24kHz, layout revision 206.
- Upstream license: GPL-3.0, [source](https://github.com/bird-sanctuary/bluejay/tree/v0.19.2).

The first registry entry (v0.19.0) was independently derived the same way from
[B_X_30_24_v0.19.0.hex](https://github.com/bird-sanctuary/bluejay/releases/download/v0.19.0/B_X_30_24_v0.19.0.hex).
Its HEX SHA-256 is `8a2909bf20be14d9c09af512d77879c3bd207adac22d34019ca3d32a97e3d3b2`.

Normal name-tag detection remains available for other Bluejay builds. Missing-name fallback
only accepts a registered MCU/header and an exact complete application hash; version or MCU
similarity alone is insufficient. Add other official hashes with their provenance as needed.
