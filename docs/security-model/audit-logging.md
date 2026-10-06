# Audit Logging

Audit logs are newline-delimited JSON records.

Each line contains:

- `event`: audit event payload
- `signature`: Signature over the encoded `event`

The audit signature algorithm depends on the platforms in the build:

| Platforms | Audit signature |
| --- | --- |
| `ecc`, with or without `pqc` | Ed25519 |
| `pqc` only | ML-DSA-44 |

The signing key is TKeeper's integrity key. `event.integrityKeyVersion` tells the verifier which integrity public key version to use.

Example line, formatted for readability:

```json
{
  "event": {
    "id": "01J9Y3J7F8H4B8N8H5M6Y2K3Q1",
    "peerId": 1,
    "integrityKeyVersion": 3,
    "timestamp": 1760000000000,
    "event": "keeper.sign",
    "auth": {
      "subject": "service:payments-api"
    },
    "context": {
      "sid": "sign-01J9Y3K2H7G9M5N4"
    },
    "request": {
      "method": "POST",
      "path": "/v2/keeper/sign",
      "remoteAddress": "10.0.12.44"
    },
    "crypto": {
      "algo": "ECDSA",
      "kid": "payments-hot",
      "generation": 2
    },
    "digest": {
      "purpose": "audit",
      "hmacKeyVersion": 4,
      "bodyHash": {
        "alg": "HMAC_SHA256",
        "value64": "3Aq9i3sM1c03eK1d8eAH7Q=="
      }
    },
    "outcome": {
      "statusCode": 200
    },
    "approvers": [
      "Jq7P3Zx7T0Jmj5..."
    ],
    "policy": {
      "decision": "ALLOW",
      "matches": [
        {
          "id": "small-payment",
          "effect": "ALLOW"
        }
      ]
    },
    "imposters": [],
    "dead": []
  },
  "signature": "MEUCIQD3n7uN..."
}
```

Some fields depend on the operation. `approvers` appears only for approved operations. `policy` appears when a Verdict authority was evaluated. `imposters` and `dead` appear when a threshold protocol reports bad or unavailable peers.

`auth.subject` is the identity authenticated on the current HTTP hop. For a direct public request it is the external principal. For a protected peer request it is the keeper peer that signed the internal request, while optional `auth.actor` preserves the original external principal. Peer-only protocol rounds omit `actor`.

The `policy` object contains the evaluation `decision`, matched rules, and any `approvalRequirements`. `ALLOW_WITH_REQUIREMENTS` remains visible after proofs satisfy the requirements. A rejected challenge records the redacted groups in `outcome.approvals`.

## Integrity boundary

The signature detects modification of an individual encoded event when the verifier has the correct integrity public key. It does not by itself prove that the log is complete, correctly ordered, retained, or delivered to every configured sink.

For compliance or incident evidence:

- preserve events in an access-controlled external system
- retain integrity public keys for every referenced version
- monitor gaps, duplicate ids, and unexpected time ordering at the collector
- define retention and deletion controls outside TKeeper
- verify records independently instead of trusting only the producer

## File sink

```hocon
keeper.audit {
  enabled = true
  timeout = 1000

  file {
    directory = "/var/lib/tkeeper/audit"
    extension = "ndjson"
    prefix = "audit"
    max-file-size-bytes = 67108864
    roll-every = 1d
    max-files = 10
    retention-days = 30
    gzip = false
    fsync = false
  }
}
```

## Socket sink

```hocon
keeper.audit {
  enabled = true

  socket {
    host = "audit.local"
    port = 443
    tls {
      protocols = ["TLSv1.3", "TLSv1.2"]
      verify-hostname = true
      trust {
        mode = "system"
      }
    }
  }
}
```

The socket sink marks a line accepted after TKeeper writes and flushes it to the local socket stream. This is not a collector durability acknowledgement. If the local write does not complete before `ack-timeout`, TKeeper treats that sink as failed.

## Verification

Verify one signed audit line:

```http
POST /v1/keeper/audit/verify
```

Body:

```json
{
  "event": {
    "id": "01J9Y3J7F8H4B8N8H5M6Y2K3Q1",
    "peerId": 1,
    "integrityKeyVersion": 3,
    "timestamp": 1760000000000,
    "event": "keeper.sign",
    "auth": null,
    "context": null,
    "request": null,
    "crypto": null,
    "digest": null,
    "outcome": null,
    "approvers": null,
    "policy": null,
    "imposters": null,
    "dead": null
  },
  "signature": "..."
}
```

Response:

```json
{ "valid": true }
```

Verify a batch:

```http
POST /v1/keeper/audit/verify/batch
```

Body:

```json
{
  "logs": [
    {
      "event": {
        "id": "01J9Y3J7F8H4B8N8H5M6Y2K3Q1",
        "peerId": 1,
        "integrityKeyVersion": 3,
        "timestamp": 1760000000000,
        "event": "keeper.sign",
        "auth": null,
        "context": null,
        "request": null,
        "crypto": null,
        "digest": null,
        "outcome": null,
        "approvers": null,
        "policy": null,
        "imposters": null,
        "dead": null
      },
      "signature": "..."
    }
  ]
}
```

Batch response is keyed by event id:

```json
{
  "01J9Y3J7F8H4B8N8H5M6Y2K3Q1": {
    "valid": true
  }
}
```

Required permission:

```text
tkeeper.audit.log.verify
```

Rotate the integrity key:

```http
POST /v1/keeper/integrity/rotate
```

Required permission:

```text
tkeeper.integrity.rotate
```

Restart every peer after rotating an integrity key. Peer integrity-key pins are process-local in 2.2.0+; until restart, callers that previously contacted the rotated peer continue to reject its new signed responses.

Rotation keeps historical public keys for log verification and removes the corresponding historical private keys. Replaying only the current-version pointer fails closed when it no longer matches the stored history. A coordinated same-location replay of the pointer and its matching records can still pass local verification, as can a complete database rollback. Detecting that class of rollback requires an independently protected monotonic checkpoint or external audit anchor.

During a legacy storage upgrade, TKeeper migrates audit-HMAC records during unseal. The node remains unready if record validation fails.

Peers expose their current integrity public key on the internal API:

```http
GET /v1/integrity/publicKey
```

Response:

```json
{ "data": "base64-public-key" }
```

## Failure behavior

When audit is enabled, TKeeper checks sink availability before protected operations. At least one configured sink must be available.

When an event is written, the operation continues if at least one configured sink accepts the event before the audit timeout. If all configured sinks fail or miss the timeout, the operation fails with `AUDIT_FAILED`.

With multiple sinks, one acceptance is enough for the operation to continue. If delivery to a particular archive is mandatory, enforce and monitor it at the collector or deployment layer.

## Common problems

### Audit sink is down

If at least one sink is alive, operations continue. If no sink is available, protected operations fail with `AUDIT_NOT_AVAILABLE` before the crypto session starts.

### Verification fails

Check the exact event encoding, the signature algorithm for the build, and the public key version in `event.integrityKeyVersion`.
