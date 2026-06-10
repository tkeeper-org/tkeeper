![TKeeper logo](assets/keeper-banner.png)

<div align="center">

# TKeeper

[TKeeper Labs](https://tkeeper.org) • [exploit.org](https://exploit.org) • [Documentation](https://tkeeper.org/docs) • [OpenAPI](openapi.yaml)

</div>

TKeeper controls machine authority.

A machine becomes risky when it can cause a real effect: move funds, approve a spender, issue a certificate, decrypt data, rotate a key, import key material, or delegate power.

Classic access control answers who can call an API. TKeeper answers what this call is allowed to cause.

TKeeper places policy on the authority path. Before `sign`, `decrypt`, `rotate`, `refresh`, `destroy`, or `import` starts, it evaluates configured controls: auth, permissions, key lifecycle, time policy, four-eye policy, authority policy, audit, and integrity.

Built on [Anvil](https://github.com/exploit-org/anvil): cryptographic building blocks for threshold ECDSA, FROST, and verifiable threshold ECIES.

See [Documentation](https://tkeeper.org/docs) for deployment, API, protocols, and threat model.

---

## Authority Path

TKeeper turns a machine request into a verifiable authority decision.

```text
                 1. intent
┌──────────────┐ ─────────────▶ ┌──────────────┐
│   Machine    │                │   TKeeper    │
└──────────────┘ ◀───────────── └──────────────┘
        │        2. proof
        │
        │ 3. request + proof
        ▼
┌──────────────┐
│   Backend    │
└──────────────┘
        │
        │ 4. verify proof, execute effect
        ▼
┌──────────────┐
│    Effect    │
└──────────────┘
```

The machine submits the request and proof to the backend. The backend verifies that the proof is valid for the exact intent before executing the effect.

No valid proof for this exact intent means no effect.

---

## Intent → Policy → Decision → Proof

TKeeper keeps the control path together:

| Stage    | Meaning                                      |
|----------|----------------------------------------------|
| Intent   | Understand the requested action              |
| Policy   | Evaluate configured controls                 |
| Decision | Approve or deny the operation                |
| Proof    | Bind approval to the exact action            |

If intent, policy, decision, or proof split apart, control breaks.

---

## Quorum Modes

TKeeper supports two quorum modes:

- `mono` (`1-of-1`): local key material, same authority controls, no threshold custody. **Fastest Time-To-Market**.
- `threshold` (`t-of-n`): key shares across peers, quorum required for operations. **Highest Security**.

Threshold mode removes the single cryptographic control point. Private key material is split across peers and never reconstructed during signing or decryption. TKeeper uses MPC to distribute authority across peers.

In `threshold` mode, private key material is split into shares. Signing and decryption require quorum participation, and the private key is never reconstructed on any machine.

Policy is part of quorum participation.

Each peer validates the intent against its local policy state before contributing to signing or decryption. A coordinator can propose an operation, but it cannot force peers to authorize it.

If enough honest peers reject the intent so that no accepting quorum can be formed, the operation does not complete.

This means authority is not controlled by one instance:

- fewer than `t` compromised peers cannot recover the key
- fewer than `t` compromised peers cannot produce a signature or decryption
- fewer than `t` compromised peers cannot bypass policy

- bypassing policy requires compromising at least `t` peers under accepting policy state

TKeeper can start in `mono` mode for policy enforcement and later be promoted to `threshold` mode when distributed authority is required.

---

## Authorities

Authorities describe what kind of consequence a key may authorize.
TKeeper materializes command data into a typed intent and evaluates authority policy before key material participates.

Currently supported:
- **`arbitrary`** for ungoverned arbitrary bytes signing
- **`typed`** for custom schema-based governed data signing (e.g your internal operations, AI agents tools call and etc)
- **`authority-x509`** for governed certificate issuance
- **`authority-bitcoin`** for BTC (and forks) governed transaction signing
- **`authority-evm`** for EVM (Ethereum/BNB and any evm-compatible) governed transaction signing with describable effects.

`arbitrary` and `typed` are available out of box, while others should be added separately in build. See [Documentation](docs).

---

## Cryptographic Core

TKeeper uses MPC to remove unilateral cryptographic control.

| Capability           | Protocols                                         | Curves                        |
|----------------------|---------------------------------------------------|-------------------------------|
| Threshold signing    | GG20 ECDSA, FROST Schnorr, BIP-340, Taproot       | secp256k1, secp256r1, Ed25519 |
| Threshold decryption | Threshold ECIES                                   | secp256k1, secp256r1          |
| Key lifecycle        | DKG, import, refresh, rotate, destroy             | secp256k1, secp256r1, Ed25519 |
| Key derivation       | deterministic scalar tweak                        | supported signing curves      |


Protocol details live in the documentation and in [Anvil](https://github.com/exploit-org/anvil).

---

## Access Control

Every operation is authenticated and authorized against explicit permission identifiers scoped by key and operation:

```text
tkeeper.key.{keyId}.sign
tkeeper.key.{keyId}.decrypt
tkeeper.key.{keyId}.dkg
tkeeper.key.*.sign
tkeeper.key.*.*
```

Permissions are enforced before any threshold operation begins.

---

## Audit and Compliance

TKeeper emits signed, tamper-evident audit records for security-relevant actions: sign, decrypt, key generation, import, refresh, rotate, destroy, permission changes, and authority policy changes.

When sink enforcement is enabled, TKeeper denies operations if no configured audit sink is reachable.

Asset inventory endpoints expose key metadata for governance reviews and operational oversight.

---

## Threat Model

- TKeeper: see [TKeeper Threat Model](docs/threat-model.md)
- Anvil: see the [Anvil repository](https://github.com/exploit-org/anvil) for protocol-level cryptographic components and security references

---

## API Reference

The OpenAPI specification describes the HTTP surface, request and response models, and error semantics.

See [OpenAPI Reference](openapi.yaml).

---

## Running Tests

Integration tests run against a local Docker Compose cluster via [Testcontainers](https://testcontainers.com).

The test suite includes **150+** simulation tests covering quorum behavior, peer failures, protocol aborts, key lifecycle operations, audit enforcement, and permission boundaries.

See [integration-tests](integration-tests) for setup and environment details.

---

## License

Apache License 2.0. See [LICENSE.md](LICENSE.md).