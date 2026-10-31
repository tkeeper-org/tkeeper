# Errors

Protected operations return an error when authentication, permissions, policy, audit, lifecycle, or quorum checks fail. Clients should branch on the `error` enum.

## Error response shape

Error responses include:

```json
{
  "error": "ACCESS_DENIED",
  "details": "...",
  "imposters": [],
  "dead": [],
  "approvals": []
}
```

Fields:

| Field | Meaning |
| --- | --- |
| `error` | stable error enum |
| `details` | optional diagnostic detail |
| `imposters` | peers identified as bad where the protocol can identify them |
| `dead` | peers that were unavailable or failed to respond where tracked |
| `approvals` | approval groups required to resubmit an operation. Omitted for ordinary errors |

`imposters` is not guaranteed for every failure. Threshold ML-DSA can stop during normal rejection sampling without identifying an imposter.

## Common outcomes

| Error | Usually means | First check |
| --- | --- | --- |
| `UNAUTHENTICATED` | no accepted client identity | token/header/JWKS |
| `ACCESS_DENIED` | client lacks required permission | permission claim and negative grants |
| `INVALID_APPROVER`, `INVALID_APPROVER_REF` | invalid registration, metadata, or full ref | id, key material, UTF-8 byte limits, digest format |
| `APPROVER_NOT_FOUND` | exact ref is absent from this node's registry | node and complete ref |
| `APPROVER_ALREADY_REGISTERED` | normalized key belongs to another id | existing registrar assignment |
| `WEBAUTHN_REGISTRATION_INVALID` | invalid/expired invitation or invalid/conflicting ceremony (400) | invitation token, session, browser response and RP/origin |
| `WEBAUTHN_REGISTRATION_LIMIT` | active registration capacity exhausted (429) | per-actor and cluster session limits |
| `WEBAUTHN_NOT_AVAILABLE` | WebAuthn registration is turned off or lacks its platform (503) | `keeper.webauthn` and P256 availability |
| `APPROVER_REPLICATION_UNAVAILABLE` | a member is unavailable or registry preparation/delivery is unresolved (503) | all current members and durable pending work. TTL does not unlock signed reservations |
| `APPROVER_METADATA_REVISION_REQUIRED` | missing `If-Match` header (428) | current record's ETag |
| `APPROVER_METADATA_REVISION_MISMATCH` | stale or invalid `If-Match` (412) | read current metadata and reconcile before replacing |
| `APPROVAL_REQUIRED` | an authority decision requires external proofs | required `approvals` groups, then [construct a fresh approval envelope and hash](../security-model/four-eye-control.md#building-hashforsigning) |
| `KEEPER_SEALED` | node is sealed | unseal state |
| `NOT_COORDINATOR` | request sent to non-coordinator | coordinator config |
| `INVALID_AUTHORITY` | invalid authority list, id, OCI reference, document, or policy | key authority configuration and artifact digest |
| `AUTHORITY_VIOLATION` | command authority is not attached to the key | key authorities and command `authorityId` |
| `INVALID_AUTHORITY_ARTIFACT` | command cannot be decoded or feature missing | authority type and build features |
| `POLICY_VIOLATION` | policy denied the intent | materialized intent and matched rules |
| `AUDIT_NOT_AVAILABLE` | no audit sink is usable | audit sink config |
| `AUDIT_FAILED` | audit write failed | sink health and timeout |
| `SESSION_MAX_ROUNDS_EXCEEDED` | retry cap exhausted | peer health, request deadline, ML-DSA retries |

For the complete enum, see [`../../openapi.yaml`](../../openapi.yaml).

## Handling guidance

- Do not retry permission or policy denials blindly.
- Retry availability errors only with deadlines.
- Treat `imposters` as security telemetry.
- An empty `imposters` list is inconclusive. It does not establish that peers followed the protocol.
- Log `details`, but do not build business logic on unstable detail text.
