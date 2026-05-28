# Audit Logging

Audit logs are newline-delimited JSON records.

Each line contains:

- `event`: audit event payload
- `signature`: Ed25519 signature over the encoded `event`

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

The policy object is Verdict's `PolicyEvaluation`: `decision` plus matched rules.

## File Sink

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

## Socket Sink

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

Socket sinks expect an ack. If the sink accepts the line but never acks it, the operation waits until `ack-timeout` and then treats that sink as failed.

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

Peers expose their current integrity public key on the internal API:

```http
GET /v1/integrity/publicKey
```

Response:

```json
{ "data": "base64-public-key" }
```

## Failure Behavior

When audit is enabled, TKeeper checks sink availability before protected operations. At least one configured sink must be available.

When an event is written, the operation continues if at least one configured sink accepts the event before the audit timeout. If all configured sinks fail or miss the timeout, the operation fails with `AUDIT_FAILED`.

## Frequent Problems

### Audit sink is down

If at least one sink is alive, operations continue. If no sink is available, protected operations fail with `AUDIT_NOT_AVAILABLE` before the crypto session starts.

### Verification fails

Check the line encoding, the Ed25519 signature, and `event.integrityKeyVersion`.
