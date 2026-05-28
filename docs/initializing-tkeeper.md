# Initializing TKeeper

Init writes the keeper identity and quorum settings into the sealed store.

TKeeper has two quorum modes:

- `mono`: `threshold = 1`, `total = 1`
- `threshold`: `threshold > 1`, `total >= threshold`

The mode is not a separate request field. TKeeper derives it from `threshold` and `total`.

Endpoint:

```http
POST /v1/keeper/system/init
```

Body:

```json
{
  "peerId": 1,
  "threshold": 2,
  "total": 3
}
```

Mono body:

```json
{
  "peerId": 1,
  "threshold": 1,
  "total": 1
}
```

Threshold body for one peer:

```json
{
  "peerId": 2,
  "threshold": 2,
  "total": 3
}
```

Required permission:

```text
tkeeper.system.init
```

Rules:

- `peerId` starts from 1
- `threshold` must be greater than 0
- `total` must be greater than 0
- `threshold` cannot be greater than `total`
- if `threshold` is `1`, `total` must also be `1`
- every peer in a threshold cluster must use the same `threshold` and `total`
- run init once per peer

For threshold mode, all peers must be initialized with the same `threshold` and `total`. If one peer is initialized with different cluster parameters, reset that peer's database and initialize it again with the correct parameters.

Peers can be initialized independently. The threshold parameters are the part that must match.

## Choosing A Mode

Use mono when one Keeper is enough for custody, but you still want TKeeper's authority controls around the key. Mono operations are local. There is no peer quorum, no distributed signing protocol, and no protection against compromise of that one node.

Use threshold when no single machine should be able to use the key alone. Keys are split across peers. Signing and decrypting need enough healthy peers to participate. For ECDSA TKeeper uses GG20. For Schnorr-style schemes it uses FROST. Threshold ECIES decrypts through peer partial decrypts.

Most production custody setups should use threshold mode. Mono is useful for development, small deployments, bootstrap phases, and systems that plan to promote into a quorum later.

## Promoting Mono To Threshold

A mono Keeper can be promoted into a threshold quorum:

```http
POST /v2/keeper/quorum/promote
```

Body:

```json
{
  "threshold": 2,
  "total": 3
}
```

Before promotion:

- the mono Keeper must be initialized and unsealed
- the target peers must already be initialized and unsealed with the target `threshold` and `total`
- the mono Keeper config must list the target peers as peer ids `2..total`
- the target peers must trust the mono Keeper through the internal auth setup

After promotion, the mono Keeper becomes peer `1` of the new threshold quorum. TKeeper splits active keys into shares, imports those shares into the target peers, creates a new active generation, and destroys the old mono generations locally.

Promotion returns `restartRequired = true`. Restart the promoted Keeper before using it as a threshold peer.

If the selected seal provider needs recovery material, init returns it. With manual Shamir, that means unseal shares. Store them outside the node. Without enough shares, the node stays sealed.

Manual Shamir response:

```json
{
  "threshold": 2,
  "total": 3,
  "shares64": ["...", "...", "..."]
}
```

Auto-unseal providers return `204 No Content` after successful init.

Status response:

```json
{
  "sealedBy": "shamir",
  "state": "SEALED",
  "progress": {
    "threshold": 2,
    "total": 3,
    "progress": 0,
    "ready": false
  }
}
```

If the caller does not have `tkeeper.system.unseal`, `sealedBy` is hidden.

Status endpoints:

```http
GET /v1/keeper/system/status
GET /v1/keeper/system/health
GET /v1/keeper/system/ready
GET /v1/keeper/peerId
GET /v1/keeper/ping
```

## Frequent Problems

### `KEEPER_ALREADY_INITIALIZED`

Init is one-time per node. Local re-init requires a fresh local DB.

### Wrong peer id

In threshold mode, peer ids are part of protocol state. Each node needs its own `peerId`.

### Wrong threshold or total

Reset the local database for the bad peer and run init again with the same `threshold` and `total` as the rest of the cluster.
