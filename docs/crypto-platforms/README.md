# Crypto Platforms

Select `ecc` or `pqc` when building TKeeper to include the algorithms your keys need. Features such as transaction authorities may also require a particular platform.

Read:

- [Platforms](platforms.md)
- [ECC](ecc.md)
- [PQC ML-DSA](pqc-mldsa.md)
- [ECIES](ecies.md)

## Quick choice

| Need | Platform |
| --- | --- |
| EVM, Bitcoin, X.509, ECIES, ECDSA, FROST | `ecc` |
| ML-DSA-44/65/87 identities | `pqc` |
| Everything | `all` |

A deployable artifact needs at least one platform.
