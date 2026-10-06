# Create, Rotate, and Refresh

The key id is the logical identity. A generation is the version of cryptographic material or share state used by that identity.

Create, rotate, and refresh all use the same endpoint:

```http
POST /v2/keeper/dkg
```

Body:

```json
{
  "keyId": "deployment-signing",
  "algorithm": "SECP256K1",
  "mode": "CREATE",
  "assetOwner": "customer-42",
  "authorities": [
    {
      "id": "production-deployment",
      "oci": "oci://registry.example/verdict/authorities/production-deployment@sha256:..."
    }
  ]
}
```

`authorities` is a JSON array of key authorities. These authorities define what the key identity can authorize.

Modes:

| Mode | Meaning |
| --- | --- |
| `CREATE` | new cryptographic identity |
| `ROTATE` | new generation under the same logical id; the public key changes |
| `REFRESH` | new generation with the same public key; material behavior is algorithm-specific |

Required permission is selected from `mode`:

| Mode | Permission |
| --- | --- |
| `CREATE` | `tkeeper.dkg.create` |
| `ROTATE` | `tkeeper.dkg.rotate` |
| `REFRESH` | `tkeeper.dkg.refresh` |

Successful lifecycle requests return `204 No Content`.

## Concurrent operations

DKG can run alongside signing. An admitted native signing session keeps its selected
generation when a refresh or rotation promotes a new one. New requests use the active
generation and its controls. If generation or metadata changes between policy checks
and admission, the request fails with `INCONSISTENT_KEEPER`.

Each DKG attempt owns the key's session and pending state on its participating peers.
Another attempt cannot run phases or abort that session. Consistency repair, import,
and quorum promotion reject changes to pending state while its DKG owner is active.
After an interrupted attempt ends or expires, consistency repair can handle the
remaining pending generation.

## Quorum mode behavior

In `mono` mode, TKeeper manages full key material locally:

- `CREATE` creates a local key pair
- `ROTATE` creates a new local key pair under the same logical id
- `REFRESH` creates a new generation with the same private key and public key

Mono refresh advances the generation while retaining the same key material.

In `threshold` mode, TKeeper coordinates lifecycle changes across peers:

- `CREATE` creates the first shared key generation
- `ROTATE` creates a new shared key generation and changes the public key
- ECC `REFRESH` creates new shares for the same public key
- ML-DSA `REFRESH` carries each peer's existing share and public key into the new generation unchanged; it does not replace shares or refresh cryptographic material

Each peer stores its share, metadata, and public verification data for every generation. Back up the full peer database; key-share bytes alone are insufficient for restore.

A legacy storage upgrade moves existing generations without changing their key material. Run `REFRESH` to create a signed generation with the same public key, or `ROTATE` to create one with a new key. After conversion, the legacy generation remains available for consistency rollback and inventory but cannot be used for historical processing. Reading storage does not trigger conversion.

## Public key

```http
GET /v1/keeper/publicKey?keyId=deployment-signing
GET /v1/keeper/publicKey?keyId=deployment-signing&generation=1
GET /v1/keeper/publicKey?keyId=deployment-signing&tweak=user-42
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
| `fourEye` | m-of-n approval policy; `STRICT` protects every supported operation, `LENIENT` protects `ROTATE`, `REFRESH`, and generation destruction |
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
  "keyId": "deployment-signing",
  "generation": 1,
  "approvals": {
    "keeperId": 1,
    "nonce": "destroy-deployment-signing-1",
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

In mono mode, destroy is local-only. Any non-current generation can be destroyed. The current generation cannot be destroyed.

In threshold mode, destroy is coordinated across peers. Commit and abort are bound to the peer that prepared the signed destroy session. The current generation cannot be destroyed, and a generation must be at least two generations behind the active one. This keeps the cluster away from deleting material that may still be needed while a lifecycle operation is settling.

## Consistency fix

```http
POST /v1/keeper/consistency/fix?keyId=deployment-signing
```

Required permission:

```text
tkeeper.consistency.fix
```

Use consistency fix when peers disagree about active key state and the system can safely repair from quorum data.

It is meant for interrupted `CREATE`, `ROTATE`, or `REFRESH` flows. It can sync a pending generation, clean stale pending state, or roll back to a majority-active generation when that is the only safe result. If no safe active generation has quorum support, TKeeper fails closed and does not start another DKG automatically; repair the inconsistency before rotating.

Consistency fix is for threshold mode. Mono lifecycle operations are local, so there is no peer state to reconcile.

## Expiration index

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
      "logicalId": "deployment-signing",
      "generation": 1,
      "expiresAt": 1893456000
    }
  ],
  "next": null
}
```

`limit` is optional and capped at 2000. `cursor` continues a previous page.

## Common problems

### `KEY_APPLY_OPS_FORBIDDEN` or `KEY_PROCESS_OPS_FORBIDDEN`

The key time policy expired. Check `policy.apply`, `policy.process`, and the operation type.

### `NOT_COORDINATOR`

You called a coordinator-only endpoint on a node with coordinator disabled. Call a coordinator peer.

### `DESTROY_FORBIDDEN`

Destroy requires a concrete generation greater than zero. The current generation cannot be destroyed. In threshold mode, the generation also has to be at least two generations behind the active one.
