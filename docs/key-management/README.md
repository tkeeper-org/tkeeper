# Cryptographic Identities

A key id identifies a key and its generation history. Attached authorities define what it may sign. Create, import, rotate, refresh, promote, and destroy manage its material and custody.

Read:

- [Create, Rotate, and Refresh](key-lifecycle.md)
- [Trusted Dealer Import](trusted-dealer-import.md)
- [Quorum Promotion](quorum-promotion.md)
- [Asset Inventory](asset-inventory.md)

## Lifecycle choices

| Operation | Use when | Public key |
| --- | --- | --- |
| `CREATE` | creating a new identity | new |
| `ROTATE` | creating new cryptographic material for the same logical identity | changes |
| `REFRESH` | creating a new generation without changing the public identity | same |
| Trusted dealer import | bringing existing key material into TKeeper | imported |
| Quorum promotion | moving a mono identity into threshold custody | same identity |
| Destroy | removing an old generation | active generation stays |

Refresh behavior is algorithm-specific. Threshold ECC replaces the peer shares while preserving the same aggregate key. ML-DSA advances the generation while carrying each peer's existing share and public key forward unchanged; it performs no cryptographic refresh.

## Security notes

- Keep lifecycle permissions narrower than signing permissions.
- Treat trusted-dealer import as a different trust model from DKG.
- Use rotate when key material must change.
- Use asset inventory to review authorities attached to identities.
