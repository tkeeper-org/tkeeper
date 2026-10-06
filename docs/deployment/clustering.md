# Clustering

In threshold mode, each peer runs its own TKeeper instance. A coordinator can start a session, but the peers still validate the same intent before contributing.

## Cluster invariants

Every peer must agree on:

- `threshold`
- `total`
- peer ids
- internal peer URLs
- internal authentication trust
- mTLS certificate-to-peer SPKI bindings, when enabled
- selected seal provider behavior
- artifact feature and platform set

Each peer has its own local database and seal state.

## Peer ids

Peer ids start at `1`.

Each peer is initialized once with its own `peerId` and the same `threshold` and `total` as the rest of the cluster.

Example for a `2-of-3` cluster:

| Node | `peerId` | `threshold` | `total` |
| --- | --- | --- | --- |
| keeper-1 | `1` | `2` | `3` |
| keeper-2 | `2` | `2` | `3` |
| keeper-3 | `3` | `2` | `3` |

## Public and internal APIs

TKeeper exposes two network surfaces:

| API | Used by | Boundary |
| --- | --- | --- |
| Public API | clients and operators | external auth and permissions |
| Internal API | TKeeper peers | cluster-only peer authentication |

Keep the internal API private to the cluster. Do not expose it as a public service.

## Coordinator

Coordinator-enabled nodes accept operations that start sessions, such as signing and DKG. Non-coordinator peers can still participate in threshold protocols.

Disable coordinator endpoints on a peer:

```text
KEEPER_COORDINATOR_ENABLED=false
```

or:

```bash
-Dkeeper.coordinator.enabled=false
```

## Failure model

A threshold operation can fail when:

- a peer is sealed or unreachable
- an internal certificate or trust setting is incorrect
- peers disagree on the active key generation
- a session times out
- an interrupted lifecycle operation leaves inconsistent state

Use [Troubleshooting](../operations/troubleshooting.md) for operator symptoms.

## Upgrade discipline

Run the same release artifact, feature set, and platform set on every peer. Do not assume mixed-version protocol compatibility unless that exact upgrade path has been tested.

During a rollout:

- preserve enough healthy, unsealed peers for quorum
- avoid starting lifecycle or repair operations across a partially upgraded cluster
- verify internal API trust and protocol health before proceeding to the next peer
- keep a validated database backup and rollback decision for the target release

## Security notes

- one compromised peer should not be enough to authorize as the identity
- policy integrity becomes quorum-bound only if enough peers enforce the same policy state
- restrict lifecycle permissions separately; they can replace or destroy key state
- trusted-dealer import depends on trusting the dealer path
- threshold mode does not replace host, network, seal, or audit hardening
