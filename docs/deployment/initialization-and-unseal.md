# Initialization and Unseal

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

If a fresh peer with no keys has incorrect quorum parameters, recreate its database and initialize it with the correct values. For a peer that already holds key state, stop and follow [Backup and Recovery](backup-and-recovery.md) before replacing its database.

Peers can be initialized independently. The threshold parameters are the part that must match.

## Choosing a mode

Mono holds the full private key on one host. It retains authority policy and other controls, but host compromise exposes the key.

Threshold splits the key across peers. Signing and decryption need enough healthy peers, and fewer than `threshold` compromised peers cannot act alone. Choose the mode according to this custody requirement; see [Quorum Modes](../security-model/quorum-modes.md).

## Promoting mono to threshold

See [Quorum Promotion](../key-management/quorum-promotion.md).

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

## Common problems

### `KEEPER_ALREADY_INITIALIZED`

Init is one-time per node. Local re-init requires a fresh local DB.

### Wrong peer id

In threshold mode, peer ids are part of protocol state. Each node needs its own `peerId`.

### Wrong threshold or total

For a fresh peer with no keys, recreate its database and initialize it with the cluster's `threshold` and `total`. Preserve existing key state through the [recovery procedure](backup-and-recovery.md).
