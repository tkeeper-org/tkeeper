# What is TKeeper?

TKeeper manages cryptographic identities for applications, agents, and other autonomous systems. Each identity has a key and attached authorities that define accepted commands, how their fields are interpreted, and which actions are allowed. TKeeper checks policy and controls before authorizing an action with that key.

See [Product goals](README.md#goals).

Use it to control:

- fund transfers and spender approvals
- transaction signing
- certificate issuance
- key import, rotation, refresh, and destruction
- agent tool calls and production actions

Caller permissions grant access to a key. Authority policy limits what that key may sign, such as a transfer to a particular recipient below an amount limit.

## The basic flow

```text
Caller -> command -> permission and policy checks -> signature -> verified action
```

TKeeper returns a signature only when the request passes its controls. The receiving system checks the expected key and signed content before executing the action. It also checks expiry and prevents replay when required.

## Product boundaries

TKeeper generates and imports keys, manages their generations, signs approved commands, and records audit events. Threshold mode splits key custody across peers.

The integrating application builds transactions or certificate requests, supplies any external risk decisions, verifies results, and submits or executes the approved action. A path that can execute without the signature bypasses TKeeper's controls. Host security and risk detection remain deployment and application responsibilities.

## Main concepts

| Concept | Meaning |
| --- | --- |
| Intent | The exact action being requested in a form TKeeper understands |
| Authority | The declared capability attached to a key identity |
| Policy | Rules attached to the key, authority, caller, and operation |
| Quorum mode | Whether one node or a threshold of peers controls key use |
| Proof | The cryptographic output bound to the approved action |

## Quorum modes

TKeeper supports two operating modes:

| Mode | Use when |
| --- | --- |
| `mono` | You need the same authority controls with local key material |
| `threshold` | You need key shares split across peers so one node cannot act alone |

In `mono`, compromising the host exposes the full key. Choose `threshold` when one compromised peer must not be able to sign alone. See [Quorum Modes](../security-model/quorum-modes.md) for compromise and availability limits.

## Build-time platforms

Cryptographic implementations are selected at build time:

| Platform | Provides |
| --- | --- |
| `ecc` | ECC algorithms and protocols such as ECDSA, FROST, BIP-340, Taproot, and ECIES |
| `pqc` | ML-DSA algorithms, threshold ML-DSA DKG, and threshold ML-DSA signing |

A deployable build must include at least one platform.
