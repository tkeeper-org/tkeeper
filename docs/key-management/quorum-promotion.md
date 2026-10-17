# Quorum Promotion

Quorum promotion moves all active keys on a mono node into threshold custody while preserving their public keys. The source becomes peer `1`; later signing requires a quorum.

## What promotion does

Before promotion, configure the source with peers `2` through `total`. Initialize and unseal every target peer with the requested `threshold` and `total`.

Call the source node with `tkeeper.quorum.promote`:

```http
POST /v2/keeper/quorum/promote
```

For a `2-of-3` quorum:

```json
{ "threshold": 2, "total": 3 }
```

Promotion distributes shares for each active key, creates a new generation, preserves authorities and policy, and destroys the source's old mono generations. The response reports `promotedKeys` and `restartRequired: true`. Restart the source before resuming normal operations.

Promotion also transfers the core Approvers registry, including metadata revisions, uniqueness
indexes, WebAuthn runtime, completed sessions, active registration options and commit certificates.
This transfer runs even when the mono node has no key sets. A nonempty registry requires both
`tkeeper.approvers.register` and `tkeeper.approvers.metadata` in addition to the promotion permission;
each target independently checks those permissions.

Settle registry preparations and deliveries before promotion. Targets must have an empty settled
registry, no key inventory/material and no active DKG or import. The source pins one registry
transfer draft and blocks registry mutations until promotion completes. Targets authenticate that
draft directly with the source and permanently bind retries to it. If promotion fails, retry with
the same membership and draft; TTL does not clear these safety locks.

## What promotion does not do

Promotion does not make the original mono period retroactively threshold-secure and cannot erase every backup or captured copy of the full key. If prior exposure is possible, rotate or create a new identity instead of relying on promotion.

## Verify the result

After restart, compare public keys with their pre-promotion values. Check that inventory retains the expected authorities, policy, and owner, and that old mono generations are destroyed. Compare exact Approver refs and metadata revisions on every member, and verify ownership conflicts. An unexpired WebAuthn registration started in mono mode can finish through another member after promotion. Complete a normal threshold signature before returning the deployment to service.

## When to use rotate instead

Use rotate or a new DKG when you need new cryptographic material instead of promoting existing material.

For ML-DSA, refresh carries the existing shares and public key into the new generation unchanged. Use rotate when new ML-DSA material is required.
