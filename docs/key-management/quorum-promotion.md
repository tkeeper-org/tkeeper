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

## What promotion does not do

Promotion does not make the original mono period retroactively threshold-secure and cannot erase every backup or captured copy of the full key. If prior exposure is possible, rotate or create a new identity instead of relying on promotion.

## Verify the result

After restart, compare public keys with their pre-promotion values. Check that inventory retains the expected authorities, policy, and owner, and that old mono generations are destroyed. Complete a normal threshold signature before returning the deployment to service.

## When to use rotate instead

Use rotate or a new DKG when you need new cryptographic material instead of promoting existing material.

For ML-DSA, refresh carries the existing shares and public key into the new generation unchanged. Use rotate when new ML-DSA material is required.
