# Overview

TKeeper manages cryptographic identities for applications, AI agents, and other non-human actors. Each identity combines a key with authorities, policy, permissions, and lifecycle controls.

## Goals

1. Require AI agents, services, and other non-human identities (NHIs) to obtain a signature for actions governed by key policy. TKeeper checks the command before signing; the executing system verifies the expected key, exact action, and context. See the [verifier contract](governed-cryptographic-identity.md#verifier-contract).
2. Configure tolerance to compromise and failures. Choose a `t-of-n` quorum and place peers across independent hosts and administrative domains. Fewer than `t` compromised peers cannot authorize an operation alone; enough healthy peers can continue operating when others are unavailable. See [Quorum Modes](../security-model/quorum-modes.md) for the assumptions and limits.
3. Sign digital asset transactions, payment mandates, certificates, and application commands under policies attached to their keys. See [Use Cases](use-cases.md) for supported commands and integrations.
4. Record decisions and key state for operational and compliance reviews. [Signed audit records](../security-model/audit-logging.md) contain the caller, policy decision, approvals, key generation, and outcome where applicable. [Asset inventory](../key-management/asset-inventory.md) tracks ownership, authorities, generations, and destruction state.

## How it works

For a typed command, TKeeper parses the requested action, evaluates policy, and verifies any required approvals before signing. The caller collects the approvals. The receiving application verifies the signature and executes the signed action. It must reject requests that bypass this check.

Raw `arbitrary` signing skips intent policy and is disabled by default.

## In this section

- [What is TKeeper?](what-is-tkeeper.md)
- [Governed Cryptographic Identity](governed-cryptographic-identity.md)
- [Use Cases](use-cases.md)
- [Architecture](architecture.md)
- [Status and Limitations](status-and-limitations.md)
- [Glossary](glossary.md)

## What TKeeper governs

| Area | What TKeeper controls |
| --- | --- |
| AI agents | Typed tool/action intents, spending, production actions, signed decisions |
| Crypto assets | Bitcoin, EVM, Tron, XRP, and Solana transaction signing |
| Certificates | X.509 issuance and workload identity operations |
| Internal systems | Typed commands, sensitive automation, privileged operations |
| Key lifecycle | DKG, import, refresh, rotate, destroy |

## What to read next

After this overview:

- run the local flow in [Getting Started](../getting-started/README.md)
- choose a deployment shape in [Quorum Modes](../security-model/quorum-modes.md)
- select build modules in [Build and Features](../deployment/build-and-features.md)
- review guarantees and non-goals in [Threat Model](../security-model/threat-model.md)
