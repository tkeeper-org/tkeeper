# Troubleshooting

## Start with the failed stage

Use the error enum to identify the failed check:

| Stage | Common symptom |
| --- | --- |
| Auth | `UNAUTHENTICATED` |
| Permission | `ACCESS_DENIED` |
| Seal state | `KEEPER_SEALED` |
| Feature/platform | endpoint missing or provider missing |
| Authority | `INVALID_AUTHORITY`, `AUTHORITY_VIOLATION`, `INVALID_AUTHORITY_ARTIFACT` |
| Policy | `POLICY_VIOLATION` |
| Audit | `AUDIT_NOT_AVAILABLE`, `AUDIT_FAILED` |
| Quorum/session | timeout, dead peers, max rounds |

## Endpoint returns 404

The feature is probably missing from the artifact.

Rebuild with the required feature and platform. See [Build and Features](../deployment/build-and-features.md).

## No algorithm provider

The platform is missing from the artifact.

Examples:

- EVM, Bitcoin, X.509, and ECIES require `ecc`
- ML-DSA requires `pqc`

## `KEEPER_SEALED`

Unseal the node before protected operations. See [Initialization and Unseal](../deployment/initialization-and-unseal.md).

## `ACCESS_DENIED`

The authenticated client does not have the required permission.

Check:

- token identity
- permission string
- wildcard scope
- key id in the permission template

See [Permissions](../api-reference/permissions.md).

## `AUTHORITY_VIOLATION`

The command authority does not match the authority attached to the key identity.

Check:

- command `authorityId`
- command `type`
- key authorities
- authority document `id`
- authority document `type`

See [Authorities](../signing-and-authorities/authorities.md).

## `INVALID_AUTHORITY`

The key's authority configuration is invalid. Check for an empty list, duplicate ids, mixing `arbitrary` with concrete authorities, missing or mutable OCI references, a loaded document id mismatch, or invalid policy syntax.

## `POLICY_VIOLATION`

The authority policy denied the intent. Inspect the command and policy before retrying.

Check the materialized intent and effects. If an external verdict is used, verify the verdict input is bound to the same action that will be signed.

## `SESSION_MAX_ROUNDS_EXCEEDED`

The session retry cap was exhausted.

For threshold ML-DSA, healthy attempts can abort during rejection sampling. Check retries and latency before attributing the failure to a bad peer.

Check:

- retry count
- peer health
- request deadline
- `keeper.session.mldsa.max-rounds`
- signing latency distribution

## Threshold operation hangs or fails

Check:

- every required peer is reachable
- every required peer is unsealed
- internal API TLS/trust is correct
- quorum configuration matches
- the key generation exists on enough peers
- the operation is sent to a coordinator
- consistency repair is not required

## Audit blocks operations

If audit enforcement is enabled, TKeeper can deny protected operations when no audit sink accepts the event.

Check:

- audit device config
- network path to socket sink
- file sink directory permissions
- audit timeout
- TLS and SPKI pinning for socket sink
