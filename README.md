![TKeeper logo](assets/tk-bg.png)

<div align="center">

# TKeeper

[TKeeper Labs](https://tkeeper.org) • [exploit.org](https://exploit.org) • [Documentation](docs/README.md) • [OpenAPI](openapi.yaml)

</div>

TKeeper is a governed cryptographic identity layer for machines, agents, services, and workflows.

A TKeeper identity combines:

- cryptographic key material, held locally or split across peers
- an authority manifest that defines which typed actions the identity can authorize
- controls for callers, policy, approvals, quorum, lifecycle, and audit

While traditional access control decides whether a caller may reach an API, TKeeper also decides whether the selected identity may authorize the exact requested action.

For typed authorities, the enforcement contract is simple: \
**If TKeeper can't understand and approve the action, it won't produce signature.**

## How it works

```text
Machine / Agent              TKeeper                             Backend
───────────────              ───────                             ───────

Requests an action    ────>   Understands the exact intent
                              Enforces authority and policy
                              Collects approval / quorum
                              Produces signature           ────>  Verifies the signature
                                                                  Executes the action
```

TKeeper signs only after the request passes the identity's controls. For supported types, compose also returns a signed transaction or payment credential. The downstream system verifies the signature before acting; a CA assembles the final certificate.

## Use cases

Build TKeeper with the feature modules each use case needs.

| Use case         | What the identity governs                                     |
|------------------|---------------------------------------------------------------|
| [For AI](docs/use-cases/for-ai.md) | MCP actions, AP2 and MC VI payments, signed decisions |
| [For Digital Assets](docs/use-cases/for-digital-assets.md) | EVM, Bitcoin, Tron, XRP, Solana transactions |
| [For PKI](docs/use-cases/for-pki.md) | X.509 issuance and workload identities |
| [For Other Activities](docs/use-cases/for-other-activities.md) | typed commands and privileged automation |

See [Use Cases](docs/use-cases/README.md).

### Quick example

An AI support agent can refund small orders automatically. Larger refunds require human approval.

```yaml
id: refund-order
type: custom

config:
  fields:
    orderId: { type: string }
    amount: { type: bigint }
    expiresAt: { type: time }

policy:
  fallback: DENY

  approvers:
    support-lead:
      algorithm: ED25519
      publicKey64: "..."

  allow:
    - id: automatic-refund
      where:
        - "bigint.lte(amount, '100')"
        - "!time.after(time.now(), expiresAt)"

    - id: reviewed-refund
      where:
        - "bigint.gt(amount, '100')"
        - "bigint.lte(amount, '1000')"
        - "!time.after(time.now(), expiresAt)"
      approvals:
        threshold: 1
        approvers: [support-lead]
```

Now when AI agent asks TKeeper to sign a refund request
- If refund amount is less or equal `100`, it will approve request and produce signature, that backend must verify before execution.
- If refund amount is in `100.1000`, TKeeper will require [human approval](docs/security-model/four-eye-control.md) to produce proof.
- If refund amount is more than `1000`, TKeeper will decline the request.

```json
{
  "keyId": "support-agent",
  "command": {
    "type": "custom",
    "authorityId": "refund-order",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "orderId": "ord_123",
        "amount": "<amount>",
        "expiresAt": "2030-01-02T03:09:05Z"
      }
    }
  }
}
```

## Authorities

Authorities define what a key identity may authorize.

| Authority type         | Use                                                     |
|------------------------|---------------------------------------------------------|
| `arbitrary`            | raw signing; high-risk, no semantic intent in TKeeper   |
| `custom`               | typed JSON commands, internal systems, AI-agent actions |
| `evm.transaction`      | governed EVM transaction signing                        |
| `bitcoin.transaction`  | governed Bitcoin transaction signing                    |
| `tron.transaction`     | governed Tron transaction signing                       |
| `xrp.transaction`      | governed XRP transaction signing                        |
| `solana.transaction`   | governed Solana transaction signing                     |
| `ap2.mandate`          | governed AP2 payment credential signing                |
| `mcintent.mandate`     | governed Mastercard Verifiable Intent signing          |
| `x509.tbs-certificate` | governed certificate issuance                           |

Concrete authorities use digest-pinned authority documents that act as capability manifests. TKeeper materializes the command into an intent, evaluates policy, and signs only when the final decision is `ALLOW`.
`custom` is available out of the box. Raw `arbitrary` signing is built in but disabled by default;
enable `keeper.authority.arbitrary.enabled` only when raw signing is intentional. Other authority
types can be included during the build.

See [Signing and Authorities](docs/signing-and-authorities/README.md).

## Deployment modes

TKeeper supports 2 deployment modes, one for low-risk and the other for mid-high risk organizations.

### Mono
TKeeper is deployed as single instance. It is the simplest form designed for small orgs where no high-risk (e.g money transfers) actions are executed.

### Threshold
TKeeper is deployed as `t` of `n` quorum, where `n` defines total number of TKeeper nodes, `t` defines **compromise tolerance** and `n-t` defines **fault tolerance**.

Simply talking, if you deployed `2-of-3` configuration, it means that:

- While **2** nodes are not compromised, attacker can't produce fake proof, steal key or tamper policies.
- If **1** node is unavailable (e.g. network error), the system continues to work without interruptions.

This mode is designed for high-risk organizations, as it allows to distribute risks inside/across organizations, prevents silent policy weakening, and even allows control to be shared externally (for example, between a platform and users of a crypto wallet).

> 
> TKeeper can be first configured in mono mode and then promoted to `t-of-n` quorum.
> 

See [Quorum Modes](docs/security-model/quorum-modes.md).

## Documentation

- [Product Overview](docs/overview/README.md)
- [Use Cases](docs/use-cases/README.md)
- [Getting Started](docs/getting-started/README.md)
- [Deployment](docs/deployment/README.md)
- [Security Model](docs/security-model/README.md)
- [Status and Limitations](docs/overview/status-and-limitations.md)
- [Cryptographic Identities](docs/key-management/README.md)
- [Signing and Authorities](docs/signing-and-authorities/README.md)
- [Crypto Platforms](docs/crypto-platforms/README.md)
- [API Reference](docs/api-reference/README.md)
- [Operations](docs/operations/README.md)

## Build

Cryptographic implementations are selected at build time.

| Platform | Provides                                                                     |
|----------|------------------------------------------------------------------------------|
| `ecc`    | `SECP256K1`, `P256`, `ED25519`, ECDSA, FROST, BIP-340/Taproot, ECIES support |
| `pqc`    | `MLDSA44`, `MLDSA65`, `MLDSA87`, threshold ML-DSA DKG and signing            |

A deployable artifact must include at least one platform.

Build all default production features and platforms:

```bash
./gradlew :build -Pkeeper.features=all -Pkeeper.platforms=all
```

Build only what you need:

```bash
./gradlew :build -Pkeeper.features=agentic-payments,digital-assets -Pkeeper.platforms=ecc
```

See [Build and Features](docs/deployment/build-and-features.md).

## Security references

**Security assurance:** 367 automated functional scenarios, including 90
protocol and corruption failure-injection scenarios plus one 3-of-5 share-recovery scenario, run
for every pull request and commit to `main`. See
[Security Assurance](docs/security-model/security-assurance.md) for tested attack
vectors and executable evidence.

- [TKeeper Threat Model](docs/security-model/threat-model.md)
- [Anvil](https://github.com/exploit-org/anvil) for protocol-level cryptographic components

## API

The HTTP contract is described by [openapi.yaml](openapi.yaml).

Java integrations can use [`org.exploit:tkeeper-sdk:2.4.1`](sdk/README.md).

## Verification

Build a selected production artifact and run its root, SDK, feature, and platform unit tests:

```bash
./gradlew build -Pkeeper.features=all -Pkeeper.platforms=all
```

Run the complete release gate:

```bash
./gradlew releaseGate
```

`releaseGate` runs every module's unit tests, verifies artifact isolation, builds `exploit/tkeeper:dev` and `exploit/tkeeper:production-it`, and runs the functional integration suite. Performance benchmarks remain separate. Do not deploy either test image as production runtime.

See [integration-tests](integration-tests/README.md).

## License

Apache License 2.0. See [LICENSE.md](LICENSE.md).
