# Quorum modes

TKeeper supports two custody modes:

| Mode | Configuration | Compromise boundary |
| --- | --- | --- |
| `mono` | `1-of-1` | one TKeeper host can use the key |
| `threshold` | `t-of-n` | fewer than `t` peers cannot use the key alone |

Choose threshold mode when one compromised peer must not be able to sign alone. Place shares across independent hosts and administrative domains so one compromise cannot reach the threshold.

## Threshold guarantees

Each peer stores one share and validates an operation before participating. Signing or threshold decryption completes only with enough accepted contributions; the private key is not reconstructed by the normal protocol flow.

This protects against:

- compromise or theft of fewer than `threshold` shares
- one malicious or careless operator controlling one peer
- unilateral key use by one TKeeper host
- some Byzantine peer behavior, where the protocol can reject or identify invalid contributions

Policy enforcement also becomes quorum-dependent when honest peers hold matching policy state and independently validate the same request. A compromised minority may approve locally but cannot complete the cryptographic operation alone.

Imposter evidence is protocol-specific. FROST, GG20, and threshold ECIES can identify some invalid contributions. Threshold ML-DSA validates transcripts, but a normal rejection-sampling abort is not evidence of a malicious peer.

## What threshold mode does not guarantee

Threshold mode does not:

- preserve confidentiality or integrity after at least `threshold` peers are compromised
- guarantee availability when too few healthy peers can participate
- make inconsistent or malicious policy accepted by a quorum safe
- remove the need for host, network, seal, backup, and audit controls
- undo exposure that happened while a key previously existed in mono form

The threshold is a security boundary and an availability dependency. Select `t` and `n` together with failure-domain placement and recovery objectives.

## Operational cost

Threshold operations add peer networking, session deadlines, coordinated deployment, per-peer sealing, consistency recovery, and more failure states. ML-DSA adds bounded retries because a healthy signing attempt can abort during rejection sampling.

Plan for:

- loss or sealing of a peer
- internal TLS or trust failures
- partially completed lifecycle operations
- version or feature drift between peers
- session timeout and retry behavior
- per-peer backup and recovery without collapsing shares into one failure domain

## When mono is acceptable

Mono retains authentication, permissions, authorities, four-eye control, time policy, and audit, but one process holds full private key material. A host compromise is therefore a key compromise.

Use mono when that risk is explicitly acceptable: local development, low-impact workloads, or a controlled bootstrap phase. Do not describe mono as threshold custody or protection from a malicious host.

## Promotion to threshold

TKeeper can promote a mono identity with:

```http
POST /v2/keeper/quorum/promote
```

Promotion distributes the existing identity into threshold state; it does not create a history in which the key was never whole. Backups, memory captures, or prior compromise may retain the mono key. Rotate or run a new DKG when prior exposure cannot be accepted.

Target peers must already be initialized and unsealed with matching `threshold` and `total`. See [Quorum Promotion](../key-management/quorum-promotion.md).

## Decision rule

Use threshold when a single-host compromise must not expose the key. If operational constraints require mono, account for full-key exposure in the risk and recovery plan.
