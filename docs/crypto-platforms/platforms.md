# Platforms

Platforms provide algorithm implementations. They are selected separately from features.

| Platform value | Module | Provides |
| --- | --- | --- |
| `ecc` | `:platform-ecc` | `SECP256K1`, `P256`, `ED25519`, ECDSA, FROST, BIP-340/Taproot support, ECIES side support |
| `pqc` | `:platform-pqc` | `MLDSA44`, `MLDSA65`, `MLDSA87`, ML-DSA DKG, signing, import, and promotion support |

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

If a feature needs a platform, include both. The build should fail early when the graph is incomplete.

## Operational note

Platform selection is not runtime configuration. If an algorithm provider is missing, rebuild the artifact.
