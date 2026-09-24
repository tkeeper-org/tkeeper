![TKeeper logo](assets/tk-bg.png)

# TKeeper

[Website](https://tkeeper.org) · [Documentation](docs/README.md) · [OpenAPI](openapi.yaml) · [Java SDK](sdk/README.md)

TKeeper provides cryptographic identities for AI agents, services, and other non-human actors. Each identity combines:

- a key, held by one node or split across a threshold quorum;
- an authority manifest attached to that key, defining which actions it can authorize;
- controls for callers, policy, approvals, audit, and key lifecycle.

As agents move from proposing actions to moving funds and changing production systems, applications need verifiable authorization for each action. TKeeper checks the identity's manifest and controls, then signs the approved action. The receiving system verifies that signature before executing it. Teams use this boundary to build and secure agent tools and payments, digital asset applications, PKI, and internal automation.

## How an identity authorizes an action

1. A caller authenticates and requests a signature with a specific key.
2. TKeeper checks the caller's permission and the key's authority. For a typed command, the authority interprets the action and its policy checks it.
3. TKeeper collects required approvals and, in threshold mode, a signing quorum. An allowed command gets a signature.
4. The receiving system verifies the signature or artifact, then executes the authorized action (for example, broadcasting the transaction).

`POST /v2/keeper/sign` returns a signature.
`POST /v2/keeper/compose` runs the same checks and can return a signed transaction, payment credential or any other "composed" artifact. [Signing and Authorities](docs/signing-and-authorities/README.md) explains the request and policy model.

Raw `arbitrary` signing has no intent policy and is disabled by default.

## What you can govern

| Work                                                                | Guide                                                                                                                                                    |
|---------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Agent tools over MCP; AP2 and Mastercard Verifiable Intent payments | [MCP action](docs/use-cases/for-ai.md#govern-an-mcp-action) · [AP2](docs/ai/agentic-payments/ap2.md) · [MC Intent](docs/ai/agentic-payments/mcintent.md) |
| Bitcoin, EVM, Tron, XRP, and Solana transactions                    | [For Digital Assets](docs/use-cases/for-digital-assets.md) · [Chain authorities](docs/digital-assets/README.md)                                          |
| X.509 certificate signing                                           | [For PKI](docs/use-cases/for-pki.md) · [X.509 example](docs/pki/x509.md#authority-example-workload-server-certificate)                                   |
| Typed commands for internal systems                                 | [For Other Activities](docs/use-cases/for-other-activities.md) · [Custom authorities](docs/signing-and-authorities/arbitrary-and-typed.md)               |

## Multi-Party Computation and compromise resistance

TKeeper supports `mono` and `threshold` operating modes. In `mono`, one host holds the full key material; compromising that host compromises the identity.

In `threshold` mode, TKeeper uses multi-party computation (MPC) for operations. Each peer holds one key share and checks the operation before contributing. A signature needs `t` accepted contributions from `n` peers. Normal threshold signing does not reconstruct the private key.

For a `2-of-3` identity, one compromised peer cannot sign alone or recover the key from its share. One unavailable peer leaves two that can still sign. The protection boundary ends at two compromised peers, and signing stops if fewer than two healthy peers can participate.

Place peers across separate hosts and failure domains to distribute compromise risk. Honest peers with matching authority and policy state reject actions that violate those rules, even if a minority peer is compromised. Keys created with distributed key generation never exist whole on one peer; imported or promoted keys may have existed whole earlier. See [Quorum Modes](docs/security-model/quorum-modes.md) and the [Threat Model](docs/security-model/threat-model.md).

## Get started

Follow [Local Single Node](docs/getting-started/local-single-node.md) to try TKeeper. A default production build requires Java 25:

```sh
./gradlew :build -Pkeeper.features=all -Pkeeper.platforms=all
```

`all` includes default production features. MCP, developer authentication, policy dry run, and recovery require explicit selectors. See [Build and Features](docs/deployment/build-and-features.md) before building a smaller artifact.

To package native libraries for one OS/CPU instead of all bundled variants, add `-Ptarget=linux-amd64` (or another [supported target](docs/deployment/build-and-features.md#select-a-native-oscpu-target)). The default `-Ptarget=all` keeps all bundled variants.

Use the [Java SDK](sdk/README.md) or [OpenAPI](openapi.yaml) to integrate. For production boundaries, read the [Threat Model](docs/security-model/threat-model.md) and [Status and Limitations](docs/overview/status-and-limitations.md).

Run the full release checks with `./gradlew releaseGate`. See [Integration Tests](integration-tests/README.md) for the Docker-backed suite.

Apache License 2.0. See [LICENSE.md](LICENSE.md).
