![TKeeper logo](assets/tk-bg.png)

# TKeeper

[Website](https://tkeeper.org) · [Documentation](docs/README.md) · [OpenAPI](openapi.yaml) · [Java SDK](sdk/README.md)

TKeeper manages cryptographic identities for AI agents, services, and other autonomous systems. Each cryptographic identity has:

- a key held by one node or split across peers;
- attached authorities that define accepted commands and policy;
- caller permissions, approval requirements, audit records, and key lifecycle controls.

## Goals

1. Require AI agents, services, and other non-human identities (NHIs) to obtain a signature for actions governed by key policy. The receiving system verifies the expected key and signed action before execution.
2. Distribute key custody and request validation across a configurable quorum. Fewer than `t` compromised peers cannot sign alone, and an available quorum can continue operating. See [Quorum Modes](docs/security-model/quorum-modes.md) for assumptions and limits.
3. Sign digital asset transactions, payment mandates, certificates, and application commands under policies attached to their keys.
4. Record policy decisions, approvals, and operation outcomes in signed audit events. Track key ownership, generations, and destruction state for operational and compliance reviews.

## How an identity authorizes an action

1. A caller authenticates and requests a signature with a specific key.
2. TKeeper checks permissions, validates the command against an attached authority, and evaluates its policy.
3. The request must satisfy the key's controls, including any required approvals. In threshold mode, enough peers must accept the request and contribute to the signature.
4. The receiving system verifies the expected key, signature, and signed action, checks freshness and replay rules, then executes the action (for example, broadcasting the transaction). See the [verifier contract](docs/overview/governed-cryptographic-identity.md#verifier-contract).

`POST /v2/keeper/sign` returns a signature.
`POST /v2/keeper/compose` runs the same checks and returns a signed transaction or payment credential for supported command types. Other types return the raw signature. See [Signing and Authorities](docs/signing-and-authorities/README.md) for requests and policy.

Raw `arbitrary` signing has no intent policy and is disabled by default.

## What you can govern

| Work | Guide |
| --- | --- |
| Agent tools over MCP; AP2 and Mastercard Verifiable Intent payments | [MCP action](docs/use-cases/for-ai.md#govern-an-mcp-action) · [AP2](docs/ai/agentic-payments/ap2.md) · [MC Intent](docs/ai/agentic-payments/mcintent.md) |
| Bitcoin, EVM, Tron, XRP, and Solana transactions                    | [For Digital Assets](docs/use-cases/for-digital-assets.md) · [Chain authorities](docs/digital-assets/README.md)                                          |
| X.509 certificate signing                                           | [For PKI](docs/use-cases/for-pki.md) · [X.509 example](docs/pki/x509.md#authority-example-workload-server-certificate)                                   |
| Typed commands for internal systems                                 | [For Other Activities](docs/use-cases/for-other-activities.md) · [Custom authorities](docs/signing-and-authorities/arbitrary-and-typed.md)               |

## Multi-Party Computation and compromise resistance

TKeeper supports `mono` and `threshold` operating modes. In `mono`, one host holds the full key material; compromising that host compromises the identity.

In `threshold` mode, TKeeper uses multi-party computation (MPC) to sign with distributed key shares. Each peer holds one share and checks the request before contributing. A signature needs `t` accepted contributions from `n` peers. Normal threshold signing does not reconstruct the private key.

For a `2-of-3` identity, one compromised peer cannot sign alone or recover the key from its share. One unavailable peer leaves two that can still sign. The protection boundary ends at two compromised peers, and signing stops if fewer than two healthy peers can participate.

Place peers across separate hosts and failure domains to distribute compromise risk. Honest peers with matching authority and policy state reject actions that violate those rules, even if a minority peer is compromised. Keys created with distributed key generation never exist whole on one peer; imported or promoted keys may have existed whole earlier. See [Quorum Modes](docs/security-model/quorum-modes.md) and the [Threat Model](docs/security-model/threat-model.md).

## Get started

Follow [Local Single Node](docs/getting-started/local-single-node.md) to try TKeeper. A default production build requires Java 25:

```sh
./gradlew :build -Pkeeper.features=all -Pkeeper.platforms=all
```

`all` includes default production features. Mandates, MCP, developer authentication, policy dry run, and recovery require explicit selectors. See [Build and Features](docs/deployment/build-and-features.md) to select features, cryptographic platforms, and an OS/CPU target.

Use the [Java SDK](sdk/README.md) or [OpenAPI](openapi.yaml) to integrate. For production boundaries, read the [Threat Model](docs/security-model/threat-model.md) and [Status and Limitations](docs/overview/status-and-limitations.md).

The functional suite tests protocol attacks, state corruption, and normal operations on multi-node deployments. [Security Assurance](docs/security-model/security-assurance.md) links the scenarios and their limits. Run the release checks with `./gradlew releaseGate`; [Integration Tests](integration-tests/README.md) lists the requirements and commands.

Apache License 2.0. See [LICENSE.md](LICENSE.md).
