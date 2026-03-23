![TKeeper logo](assets/keeper-banner.png)

<div align="center">

# TKeeper (Threshold Key Management System)

[TKeeper Labs](https://tkeeper.org) • [Documentation](https://tkeeper.org/docs) • [OpenAPI](openapi.yaml)

</div>


TKeeper is a distributed, threshold KMS for environments where no single machine should have unilateral key authority. It runs as a network of cooperating peers and performs cryptographic operations under a **t-of-n** threshold model: at least **t distinct peers** must participate in every sign, decrypt, or key management operation.

> The private key is split into shares via Shamir Secret Sharing and is **never reconstructed**: not during signing, not during decryption, not during key generation. Compromising up to t−1 peers yields nothing.

Built on [tss4j](https://github.com/tkeeper-org/tss4j): a purpose-built threshold cryptography library implementing GG20, FROST, and verifiable threshold ECIES.

---

## Threshold Protocols

### Threshold ECDSA: GG20

One-round online threshold ECDSA with identifiable abort. Hardened against CVE-2023-33241 (BitForge), CVE-2025-66016, and Alpha-Rays via the full CGGMP21/24 ZK proof suite: Paillier-Blum modulus proofs, no-small-factors proofs, range proofs, and respondent proofs with EC-point binding.

Supported curves: **secp256k1**, **secp256r1 (P-256)**

### Threshold Schnorr: FROST (RFC 9591)

Two-round Schnorr threshold signing with Proof-of-Possession commitments. Signing scheme is configurable per key.

| Scheme  | Description                                               |
|---------|-----------------------------------------------------------|
| Default | RFC 9591 Schnorr, SEC1-compressed R                       |
| BIP-340 | Bitcoin Schnorr, x-only R and PK                          |
| Taproot | BIP-341 key-path with TapTweak (configurable merkle root) |

Supported curves: **secp256k1**, **Ed25519**, **secp256r1 (P-256)**

### Threshold ECIES

ElGamal KEM with AEAD symmetric layer and verifiable partial decryption via DLEQ proofs. Encryption is non-interactive; decryption requires quorum participation. Each partial decrypt is accompanied by a DLEQ proof: invalid contributions are rejected with an identifiable abort.

Supported curves: **secp256k1**, **secp256r1 (P-256)**  
Supported ciphers: **AES-256-GCM**, **ChaCha20-Poly1305**  
KDF: HKDF-SHA-384 with domain separation

---

## Key Lifecycle

Keys are addressed by `logicalId` + `generation`. Supported operations:

| Operation | Description                                                                   |
|-----------|-------------------------------------------------------------------------------|
| `CREATE`  | Distributed key generation: full private key never exists on any single peer |
| `IMPORT`  | Import an existing raw private key, split and distributed across peers        |
| `REFRESH` | Re-randomize shares without changing the group public key                     |
| `ROTATE`  | Generate a new key under the same `logicalId`, incrementing `generation`      |
| `DESTROY` | Securely delete all shares across peers                                       |

Key shares are stored encrypted at rest (`SecretBox`, AES-256) and decrypted only within the scope of an active signing or decryption session.

---

## Key Tweaking

Signing and decryption support an optional `tweak` parameter. The tweak is applied as a deterministic scalar offset to the group public key, enabling per-user or per-asset key derivation from a single root key without re-running DKG.

---

## Access Control

Every operation is authenticated and authorized against explicit permission identifiers scoped by key and operation:

```
tkeeper.key.{keyId}.sign
tkeeper.key.{keyId}.decrypt
tkeeper.key.{keyId}.dkg
tkeeper.key.*.sign          # wildcard over all keys
tkeeper.key.*.*             # full access
```

Permissions are enforced at the API layer before any threshold operation begins.

---

## Audit and Compliance

TKeeper emits signed, tamper-evident audit records for all security-relevant actions (sign, decrypt, keygen, rotate, destroy, permission changes). Records are verifiable via a dedicated endpoint.

When sink enforcement is enabled, TKeeper denies operations if no configured audit sink is reachable, ensuring no operation proceeds without a durable audit trail.

Asset inventory endpoints expose key metadata (curve, scheme, generation, creation time) for governance reviews and operational oversight.

---

## Capabilities Summary

| Capability                 | Protocols                                         | Curves                        |
|----------------------------|---------------------------------------------------|-------------------------------|
| Threshold signing          | GG20 (ECDSA), FROST (Schnorr / BIP-340 / Taproot) | secp256k1, secp256r1, Ed25519 |
| Threshold decryption       | Threshold ECIES                                   | secp256k1, secp256r1          |
| Distributed key generation | Shamir + Feldman VSS                              | secp256k1, secp256r1, Ed25519 |
| Key import                 | Raw private key → distributed shares              | secp256k1, secp256r1, Ed25519 |
| Key refresh / rotation     | Share re-randomization, versioned lifecycle       | all                           |
| Signature verification     | Per-peer verification endpoint                    | all                           |
| Audit logging              | Signed tamper-evident records                     | :                             |
| Access control             | Permission-scoped per key and operation           | :                             |

---

## When TKeeper Is Not the Right Tool

TKeeper is built for environments where the cost of a key compromise is high.
If that's not your constraint, a simpler setup will serve you better.

- You need basic secret storage or envelope encryption without quorum operations
- You cannot reliably operate multiple peers (networking, monitoring, availability)
- You need a general-purpose secrets manager, then consider HashiCorp Vault instead

---

## Threat Model
- **TKeeper**: See [TKeeper Threat Model](THREAT_MODEL.md) in this repository
- **tss4j**: See [tss4j Threat Model](https://github.com/tkeeper-org/tss4j/blob/main/THREAT_MODEL.md) for cryptographic protocols' threat model.

## API Reference

The OpenAPI specification describes the complete HTTP surface, request/response models, and error semantics.

See [OpenAPI Reference](openapi.yaml)

---

## Running Tests

Integration tests run against a local Docker Compose cluster via [Testcontainers](https://testcontainers.com).

See [integration-tests](integration-tests) for setup and environment details.

---

## License

Apache License 2.0: see [LICENSE.md](LICENSE.md)