# Key Lifecycle

Create, rotate, and refresh all use the same endpoint:

```http
POST /v2/keeper/dkg
```

Body:

```json
{
  "keyId": "eth-cold-storage",
  "curve": "SECP256K1",
  "mode": "CREATE",
  "assetOwner": "customer-42",
  "authorities": [
    { "id": "arbitrary" }
  ]
}
```

`authorities` is a JSON array of key authorities.

Modes:

| Mode | Meaning |
| --- | --- |
| `CREATE` | new logical key |
| `ROTATE` | new generation under the same logical id; the public key changes |
| `REFRESH` | new shares for the same public key |

Required permission is selected from `mode`:

| Mode | Permission |
| --- | --- |
| `CREATE` | `tkeeper.dkg.create` |
| `ROTATE` | `tkeeper.dkg.rotate` |
| `REFRESH` | `tkeeper.dkg.refresh` |

Successful lifecycle requests return `204 No Content`.

## Quorum Mode Behavior

The endpoint name is the same in both quorum modes, but the work is different.

In `mono` mode, TKeeper manages full key material locally:

- `CREATE` creates a local key pair
- `ROTATE` creates a new local key pair under the same logical id
- `REFRESH` creates a new generation with the same private key and public key

Mono refresh is useful when you want lifecycle history to move forward without changing the key. It does not create peer shares because there are no peers in mono mode.

In `threshold` mode, TKeeper runs distributed key generation across peers:

- `CREATE` creates the first shared key generation
- `ROTATE` creates a new shared key generation and changes the public key
- `REFRESH` creates new shares for the same public key

Threshold DKG stores the key share, metadata, and commitments for each generation. Commitments are later used to derive peer public shares for signing, ECIES, consistency checks, and Byzantine detection.

## Public Key

```http
GET /v1/keeper/publicKey?keyId=eth-cold-storage
GET /v1/keeper/publicKey?keyId=eth-cold-storage&generation=1
GET /v1/keeper/publicKey?keyId=eth-cold-storage&tweak=user-42
```

Required permission:

```text
tkeeper.key.{keyId}.public
```

Response:

```json
{ "data64": "..." }
```

`tweak` derives a deterministic tweaked public key. Use the same tweak later when signing, verifying, encrypting, or decrypting data bound to that tweaked key.

## Policy

Key policy:

```json
{
  "apply": {
    "unit": "SECONDS",
    "notAfter": 1893456000
  },
  "process": {
    "unit": "SECONDS",
    "notAfter": 1893459600
  },
  "allowHistoricalProcess": true
}
```

Fields:

| Field | Meaning |
| --- | --- |
| `apply` | deadline for operations that create a new effect |
| `process` | deadline for operations that process existing material |
| `fourEye` | m-of-n approval policy |
| `allowHistoricalProcess` | allow process operations against historical generations |

`unit` can be `SECONDS` or `MILLISECONDS`.

If both `apply` and `process` are set, `process` must be later than `apply`.

## Destroy

```http
POST /v1/keeper/destroy
```

Body:

```json
{
  "keyId": "eth-cold-storage",
  "generation": 1,
  "approvals": {
    "keeperId": 1,
    "nonce": "destroy-eth-cold-storage-1",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Required permission:

```text
tkeeper.key.{keyId}.destroy
```

Destroy works on a specific generation. `generation` must be greater than zero. You cannot sign with an old generation after it is destroyed.

Destroy follows the quorum mode too.

In mono mode, destroy is local-only. Any non-current generation can be destroyed. The current generation cannot be destroyed.

In threshold mode, destroy is coordinated across peers. The current generation cannot be destroyed, and a generation must be at least two generations behind the active one. This keeps the cluster away from deleting material that may still be needed while a lifecycle operation is settling.

## Consistency Fix

```http
POST /v1/keeper/consistency/fix?keyId=eth-cold-storage
```

Required permission:

```text
tkeeper.consistency.fix
```

Use consistency fix when peers disagree about active key state and the system can safely repair from quorum data.

It is meant for interrupted `CREATE`, `ROTATE`, or `REFRESH` flows. It can sync a pending generation, clean stale pending state, or roll back to a majority-active generation when that is the only safe result.

If the repair cannot prove a safe state, it fails.

Consistency fix is for threshold mode. Mono lifecycle operations are local, so there is no peer state to reconcile.

## Expiration Index

TKeeper keeps an index for keys that are close to `apply` or `process` expiry.

Endpoints:

```http
GET /v1/keeper/expires?type=apply&windowSec=86400
GET /v1/keeper/expires?type=process&from=1760000000&to=1760086400
GET /v1/keeper/expires/apply?windowSec=86400
GET /v1/keeper/expires/process?windowSec=86400
GET /v1/keeper/expires/expired?type=apply
```

Required permission:

```text
tkeeper.expired.view
```

Response:

```json
{
  "items": [
    {
      "type": "APPLY",
      "logicalId": "eth-cold-storage",
      "generation": 1,
      "expiresAt": 1893456000
    }
  ],
  "next": null
}
```

`limit` is optional and capped at 2000. `cursor` continues a previous page.

## Frequent Problems

### `KEY_APPLY_OPS_FORBIDDEN` or `KEY_PROCESS_OPS_FORBIDDEN`

The key time policy expired. Check `policy.apply`, `policy.process`, and the operation type.

### `NOT_COORDINATOR`

You called a coordinator-only endpoint on a node with coordinator disabled. Call a coordinator peer.

### `DESTROY_FORBIDDEN`

Destroy requires a concrete generation greater than zero. The current generation cannot be destroyed. In threshold mode, the generation also has to be at least two generations behind the active one.
