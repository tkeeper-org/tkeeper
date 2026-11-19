# Quorum promotion

Quorum promotion moves all active keys on a mono node into threshold custody while preserving their public keys. The source becomes peer `1`. Later signing requires a quorum.

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

Promotion creates a new generation for each active key and distributes its shares. Authorities and policy are preserved. The source destroys its old mono generations. The response reports `promotedKeys` and `restartRequired: true`. Restart the source before resuming normal operations.

Promotion also transfers the Approvers registry, metadata revisions, and WebAuthn enrollment
state. Credential ownership and completed enrollments remain valid after promotion.
This transfer runs even when the mono node has no key sets. A nonempty registry requires both
`tkeeper.approvers.register` and `tkeeper.approvers.metadata` along with the promotion permission.
Each target independently checks those permissions.

Settle registry preparations and deliveries before promotion. Targets must have an empty registry with no unsettled operations. Key inventory and stored key material must both be empty. Active DKG or import sessions must finish before promotion. The source pins one registry
transfer draft and blocks registry mutations until promotion completes. Targets authenticate that
draft directly with the source and permanently bind retries to it. If promotion fails, retry with
the same membership and draft. TTL does not clear these safety locks.

Promotion uses the same durable key-import plan and recovery as [threshold import](trusted-dealer-import.md#interrupted-threshold-imports). Repeat promotion on the source after a failure or restart. Before commit, recovery compensates the previous key imports and starts a new attempt. A previously empty recipient returns to an empty key state, including when its first imported generation was greater than one.

The source records commit in the transaction that changes its quorum mode. This transaction also activates its shares and destroys mono history. It records the required restart. After commit, recovery finalizes the same attempt and preserves its keys. A repeated matching request reports the saved key count and whether the source still requires a restart.

## What promotion does not do

Promotion does not make the original mono period retroactively threshold-secure and cannot erase every backup or captured copy of the full key. If prior exposure is possible, rotate or create a new identity instead of relying on promotion.

## Verify the result

After restart, compare public keys with their pre-promotion values. Check that inventory retains the expected authorities, policy, and owner, and that old mono generations are destroyed. Compare exact Approver refs and metadata revisions on every member, and verify ownership conflicts. An unexpired WebAuthn registration started in mono mode can finish through another member after promotion. Complete a normal threshold signature before returning the deployment to service.

## When to use rotate instead

Use rotate or a new DKG when you need new cryptographic material instead of promoting existing material.

For ML-DSA, refresh carries the existing shares and public key into the new generation unchanged. Use rotate when new ML-DSA material is required.
