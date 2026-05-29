![TKeeper logo](assets/keeper-banner.png)

<div align="center">

# TKeeper

[TKeeper Labs](https://tkeeper.org) • [exploit.org](https://exploit.org) • [Documentation](https://tkeeper.org/docs) • [OpenAPI](openapi.yaml)

</div>


TKeeper controls machine authority.

A machine becomes risky when it can cause a real effect: move funds, approve a spender, issue a certificate, decrypt data, rotate a key, import key material, or delegate power. Classic access control answers who can call an API. TKeeper answers what this call is allowed to cause.

TKeeper places policy on the authority path. Before sign/decrypt/rotate/refresh/destroy/import starts, it evaluates configured controls (auth, permissions, key lifecycle, time policy, four-eye policy, authority policy, audit, integrity).

Built on [Anvil](https://github.com/exploit-org/anvil): cryptographic building blocks for threshold ECDSA (GG20), FROST, and verifiable threshold ECIES.

See [Documentation](https://tkeeper.org/docs) for all details.

---

## Quorum Modes

TKeeper supports two quorum modes:

- `mono` (`1-of-1`): local key material, same authority controls, no threshold custody
- `threshold` (`t-of-n`): key shares across peers, quorum required for operations

Mono is a simple starting path when you need policy enforcement first. It can be promoted into threshold mode with `POST /v2/keeper/quorum/promote`.

In threshold mode, private key material is never reconstructed and compromising up to `t-1` peers does not recover the key.

---

## Authorities

Authorities describe what kind of consequence a key may authorize.

- `arbitrary` authority supports raw signing and is intentionally low-context
- concrete authorities bind keys to typed policy (for example EVM, Bitcoin, X.509)

A sign request carries a command artifact with `authorityId`. TKeeper materializes command data into a typed intent and evaluates policy before key material participates.

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

## Threat Model
- **TKeeper**: See [TKeeper Threat Model](docs/threat-model.md) in this repository
- **Anvil**: See the [Anvil repository](https://github.com/exploit-org/anvil) for protocol-level cryptographic components and security references.

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
