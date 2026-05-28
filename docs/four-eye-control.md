# Four Eye Control

Four eye control is a key policy. It requires external approver signatures before sensitive operations run.

Policy shape:

```json
{
  "fourEye": {
    "m": 2,
    "n": 3,
    "keys": [
      {
        "curve": "SECP256K1",
        "publicKey64": "..."
      },
      {
        "curve": "P256",
        "publicKey64": "..."
      },
      {
        "curve": "ED25519",
        "publicKey64": "..."
      }
    ]
  }
}
```

Rules:

- `m` cannot be greater than `n`
- `m` must be at least 2
- `keys.size` must equal `n`
- duplicate approver keys are rejected
- approver public keys must decode to valid curve points
- supported approver curves are `SECP256K1`, `P256`, and `ED25519`

Operations that carry approvals hash the operation body first. Approvers sign that hash. TKeeper verifies the submitted proofs before continuing.

Approval payload:

```json
{
  "approvals": {
    "keeperId": 1,
    "nonce": "unique-nonce",
    "timestamp": 1760000000000,
    "proofs": [
      {
        "fingerprint": "...",
        "signature64": "..."
      }
    ]
  }
}
```

The nonce cannot be reused. The timestamp must not be in the future and must fit `keeper.approval.ttl`.

The coordinator peer id in `approvals.keeperId` must match the peer that coordinates the operation.

Approver signature type depends on the approver key curve:

| Curve | Approval signature |
| --- | --- |
| `SECP256K1` | ECDSA |
| `P256` | ECDSA |
| `ED25519` | EdDSA |

The approver fingerprint is:

```text
base64(sha256(compressed-public-key))
```

## Signed Fields

TKeeper uses a canonical JSON mapper for approval hashes. Object properties are sorted alphabetically, map entries are sorted by key, and null fields are omitted.

The exact fields are operation-specific:

| Operation | Fields |
| --- | --- |
| DKG | `keeperId`, `keyId`, `curve`, sorted `authorities`, `mode`, optional `policy`, optional `assetOwner`, `nonce`, `timestamp` |
| Sign | `keeperId`, `keyId`, `command`, optional `tweak`, `nonce`, `timestamp` |
| ECIES decrypt | `keeperId`, `keyId`, optional `generation`, `algorithm`, `ciphertext64`, optional `tweak`, `nonce`, `timestamp` |
| Destroy | `keeperId`, `keyId`, `generation`, `nonce`, `timestamp` |

Any change to those fields changes the approval hash.

## Frequent Problems

### Approvals fail after changing the request

Create a new approval for the exact request body.

### Duplicate approver keys fail

`n` is the number of distinct approvers.

### Approval nonce is rejected on second use

Approval nonces are one-time.
