# Architecture

TKeeper is split into a core runtime, build-time feature modules, and build-time cryptographic platforms.

## Main path

```text
Client
  -> public API
  -> authentication and permissions
  -> intent materialization
  -> authority and key policy checks
  -> audit gate
  -> key/session manager
  -> mono or threshold cryptographic operation
  -> proof/result
```

For threshold operations, the coordinator starts the session, but peers validate the same operation before contributing.

## Runtime parts

| Part | Responsibility |
| --- | --- |
| Public API | External HTTP API for clients and operators |
| Internal API | Peer-to-peer protocol calls inside a cluster |
| Auth layer | Client authentication, internal peer authentication, permission checks |
| Authority layer | Converts command data into governed intent and policy checks |
| Key lifecycle | DKG, import, refresh, rotate, destroy, generation tracking |
| Session managers | Coordinate signing, DKG, destroy, and feature-specific multi-step operations |
| Audit layer | Records security-relevant decisions and can block operations if required sinks fail |
| Storage | Local key share state, metadata, authorities, audit state, and side data |

## Features

Features add product surface area. They are selected at build time.

Examples:

| Feature | Adds |
| --- | --- |
| `digital-assets:evm` | EVM transaction intent support |
| `digital-assets:bitcoin` | Bitcoin transaction intent support |
| `digital-assets:tron` | Tron transaction intent and composition |
| `digital-assets:xrp` | XRP transaction intent and composition |
| `digital-assets:solana` | Solana transaction intent and composition |
| `agentic-payments` | AP2 and MC VI mandate signing and composition |
| `mcp` | MCP discovery, utility, signing, and composition tools |
| `authority-x509` | Certificate issuance intent support |
| `ecies` | ECIES encryption and threshold decryption |
| `ui` | Control-plane UI |
| `seal-aws` | AWS KMS seal provider |
| `seal-gcloud` | Google Cloud KMS seal provider |

If a feature is not included in the artifact, its endpoints or command types are unavailable.

## Platforms

Platforms add algorithm implementations. They are selected separately from features.

| Platform | Adds |
| --- | --- |
| `ecc` | `SECP256K1`, `P256`, `ED25519`, ECC signing protocols, ECC key derivation, ECIES support |
| `pqc` | `MLDSA44`, `MLDSA65`, `MLDSA87`, ML-DSA DKG, ML-DSA signing |

Features that depend on a platform require that platform explicitly. Digital assets, agentic payments, X.509, and ECIES require `ecc`.

## Mono and threshold

| Mode | Crypto control point | Operational meaning |
| --- | --- | --- |
| `mono` | One local node | Same policy controls, no distributed key custody |
| `threshold` | Quorum of peers | Key use requires enough peers to accept and participate |

Threshold mode protects against a single peer using the key alone. It does not remove the need for host security, network security, backups, monitoring, and careful permission design.

## Integration boundary

TKeeper should sit on the authority path, not beside it.

Good placement:

```text
Business system requires TKeeper proof before executing the effect.
```

Weak placement:

```text
Business system can execute the same effect without the governed identity.
```

The second shape may still provide logging or advisory checks, but it is not strong enforcement.
