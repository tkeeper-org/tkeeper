# Keeper configuration

`GET /v2/keeper/config` requires primary authentication and no additional permission.
It is available after initialization, including while the Keeper is sealed or needs
a restart after quorum promotion. Operation mandates and enrollment invitations cannot
authorize it.

```json
{"threshold":2,"total":3,"features":["core","ecies","mandate"],"authorities":["arbitrary","custom"],"sealProvider":"shamir"}
```

`threshold` and `total` describe the current stored quorum, including changes made by
promotion. `sealProvider` is the configured provider id, such as `shamir`, `hsm`, `aws`
or `google`; provider secrets and connection settings are not returned.

`features` contains sorted, unique ids of loaded modules, including `core`. Each runtime feature
provides a singleton implementation of the core `KeeperModule` interface with one
method, `id(): String`. No central feature catalog or config flag determines this list.
Nested module ids retain their path, for example `digital-assets:evm`, `recovery:ecc`
and `agentic-payments:ap2`. Shared runtime dependencies such as `agentic-payments` are
included when loaded. The `digital-assets` Gradle aggregation project has no runtime
artifact; only its selected chain modules appear. Cryptographic platforms are separate.

The Java SDK exposes this response as `keeper.central().getConfig()`.

`authorities` contains sorted, unique authority types supported by the loaded modules.
Core supplies `custom` and, when enabled, `arbitrary`. For example, the EVM module adds
`evm.transaction`. This is a runtime capability list; it does not describe authorities attached to
a key or grant access to one.

## Identity catalog

`GET /v1/keeper/control/identities?lastSeen=<keyId>&limit=50` lists active identities
the caller may sign with. The default page size is 50 and the maximum is 100.
The response contains `items` and `nextCursor`; pass a non-null cursor as the next
request's `lastSeen`. Sealed Keepers reject catalog requests. Tampered identities and
identities without active key material are excluded.

`GET /v1/keeper/control/identities/authority?keyId=<keyId>&authorityId=<authorityId>` returns the
attached authority's id, type, version, description and command JSON Schema. The caller
needs `tkeeper.key.<keyId>.sign`. Unknown or unattached authorities are rejected.
The schema describes command input; the policy still decides whether it may execute.

An identity page has this shape:

```json
{
  "items": [{"keyId":"payments-key","algorithm":"P256","generation":2,"authorities":["payments"]}],
  "nextCursor": "payments-key"
}
```

`nextCursor` is null on the last page. Each item names authority ids attached to its active
generation. Describe one of those ids to obtain `commandSchema`, which covers the complete
command object: `type`, `authorityId` and `artifact`. Authority `version` and `description`
can be null, including for the built-in `arbitrary` authority.

Both endpoints are core APIs and send `Cache-Control: no-store`. They do not require
inventory permissions. The SDK methods are `keeper.controlPlane().listIdentities()`
and `keeper.controlPlane().describeAuthority(keyId, authorityId)`.

Pass the cursor explicitly when using the SDK:

```java
var first = keeper.controlPlane().listIdentities(null, 50);
if (first.nextCursor() != null) {
    var next = keeper.controlPlane().listIdentities(first.nextCursor(), 50);
}
```

## Approval deadlines

Responses in approval flows include `X-EXPIRES-AT`, a Unix timestamp in whole seconds:

- WebAuthn enrollment options use the stored registration session deadline, including
  when a follower forwards the request to the writer.
- WebAuthn approval preparation uses the signed challenge's deadline.
- Operations with collected approval requirements include their approval window on
  success and on approval errors, including `APPROVAL_REQUIRED` and insufficient proofs.
- Mandate issuance uses the issued mandate's deadline.

JSON `expiresAt` values remain in milliseconds. The header truncates the fractional
second. Repeating preparation or execution keeps the original approval deadline:
`approvals.timestamp + keeper.approval.ttl`. It does not create a fresh TTL.
Authentication, current policy and replay checks still apply independently of this
deadline. Synchronous operations without approval requirements do not acquire a TTL.
