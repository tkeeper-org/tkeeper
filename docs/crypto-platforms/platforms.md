# Platforms

`keeper.platforms` selects the key algorithms included in the artifact. Set it separately from `keeper.features`.

| Platform value | Provides |
| --- | --- |
| `ecc` | `SECP256K1`, `P256`, `ED25519`, ECDSA, FROST, BIP-340/Taproot, and ECIES |
| `pqc` | `MLDSA44`, `MLDSA65`, `MLDSA87`, key generation, signing, import, and promotion |

## Build examples

All platforms:

```bash
./gradlew shadowJar -Pkeeper.platforms=all
```

ECC only:

```bash
./gradlew shadowJar -Pkeeper.platforms=ecc
```

PQC only:

```bash
./gradlew shadowJar -Pkeeper.platforms=pqc
```

## Feature dependencies

Some features require a platform:

| Feature | Required platform |
| --- | --- |
| `evm` | `ecc` |
| `bitcoin` | `ecc` |
| `tron` | `ecc` |
| `xrp` | `ecc` |
| `solana` | `ecc` |
| `authority-x509` | `ecc` |
| `ecies` | `ecc` |

Include the required platform with each feature. See the [full feature matrix](../deployment/build-and-features.md#feature-and-platform-matrix), including agentic payments and recovery.

## Operational note

To use an algorithm absent from the running build, rebuild the artifact with its platform.
