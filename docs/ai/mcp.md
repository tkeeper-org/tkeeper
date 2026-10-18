# MCP through TKeeper Hub

AI agents can manage Keeper through TKeeper Hub’s MCP tools. They can work with policies, identity keys, signing requests, approvals, inventory, audit records, and Keeper peers. MCP and the web workspace use the same domain services and the authenticated user’s permissions.

Connect an MCP client to `https://<hub-host>/mcp`. Hub manages the Keeper cluster configured for that deployment. Tool arguments do not select another cluster or an arbitrary Keeper endpoint.

## Authentication and access

Send the client’s SSO access token in `Authorization: Bearer <access-token>` on every MCP request. Hub validates its signature, issuer, and audience. Native Keeper calls forward that exact user credential in `X-JWT-TOKEN`; Keeper permissions remain authoritative.

Credentials belong in HTTP headers. Do not place access tokens, refresh tokens, or authentication overrides in tool arguments.

Additional Hub permissions are:

| Permission | Allows |
| --- | --- |
| `tkeeper.policies.publish` | Save or import policy drafts and publish authority versions |
| `tkeeper.operations.read.all` | Read all saved operations; does not grant approval, execution, or cancellation rights |

Without global operation read, the client sees its own requests, requests it is eligible to approve, and requests it has already confirmed. Execution results remain requester-only. Reading a registry entry or discovering an identity does not grant permission to change it.

See [Keeper permissions](../security-model/authentication-authorization.md) and the [Approvers registry](../api-reference/approvers.md).

## Connect and discover tools

Use a Streamable HTTP MCP client and the protocol version negotiated with Hub. For protocol `2026-07-28`, discovery is stateless: requests carry protocol metadata and mirrored method headers. This request lists tools:

```http
POST /mcp
Authorization: Bearer <SSO access token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/list

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": {
        "name": "operations-agent",
        "version": "1"
      }
    }
  }
}
```

Use the same metadata for `server/discover` and `tools/call`, with the matching `Mcp-Method` header. A tool call also sends `Mcp-Name: <tool-name>` and `params.name` / `params.arguments`. Follow `nextCursor` from `tools/list` until absent to obtain the complete catalogue and current input schemas.

Older negotiated protocol versions use `initialize`, `notifications/initialized`, and the returned `Mcp-Session-Id`. Let the MCP client manage that transport session. A lost transport session does not delete durable Hub operations.

## What an agent can manage

| Area | Tools |
| --- | --- |
| Runtime and identity discovery | `keeper_status`, `keeper_capabilities`, `keeper_controls`, `keeper_me`, `identity_list`, `identity_describe_authority` |
| Policy authoring | `policy_capabilities`, `policy_list`, `policy_draft`, `policy_versions`, `policy_version_source`, `policy_help`, `policy_templates`, `policy_validate`, `policy_save`, `policy_publish` |
| Identity keys | `key_public`, `key_create`, `key_import`, `key_refresh`, `key_rotate`, `key_destroy`, `quorum_promote` |
| Signing | `signature_sign`, `signature_compose`, `signature_verify`, `keeper_emulate` |
| Operations and approvals | `operation_get`, `operation_list`, `operation_prepare_approvals`, `operation_execute`, `operation_cancel` |
| Approvers | `approver_list`, `approver_get`, `approver_register`, `approver_replace_metadata`, `approver_webauthn_options`, `approver_webauthn_finish` |
| Inventory and expiration | `keeper_inventory`, `expiration_upcoming`, `expiration_apply_window`, `expiration_process_window`, `expiration_expired` |
| Audit | `audit_verify`, `audit_verify_batch`, `keeper_audit_sinks` |
| Peer health and access | `keeper_health`, `keeper_readiness`, `keeper_ping`, `keeper_peer_id`, `keeper_auth_config` |
| Peer maintenance | `keeper_initialize`, `keeper_unseal`, `keeper_auto_unseal`, `keeper_seal`, `keeper_integrity_rotate`, `keeper_consistency_fix`, `keeper_recover` |

`tools/list` supplies the actual MCP schemas. Native Keeper bodies can be open JSON objects in Hub’s tool schemas; use the matching [OpenAPI Documentation](../api-reference/openapi.md) for their fields. `identity_describe_authority` returns the exact command JSON Schema for an attached authority, including a custom authority.

Identity discovery uses the caller’s key-sign permissions. It does not require inventory access. See the [identity catalogue](../api-reference/configuration.md#identity-catalog) for permissions, command schemas, and cursor handling.

## Submit an operation

1. Discover an available identity and read its attached authority with `identity_list` and `identity_describe_authority`.
2. Construct the exact command accepted by that authority. Submit it through `signature_sign` or `signature_compose` with a fresh idempotency key for the new request.
3. Inspect the returned result. An approval-dependent request returns a durable `operation`; inspect it with `operation_get` or `operation_list`.
4. Collect the required proofs. For WebAuthn, `operation_prepare_approvals` supplies the native browser material for an enrolled approver. The credential holder completes the ceremony; an agent’s request does not substitute for their approval.
5. The requester calls `operation_execute` after the required confirmations have been collected. Keeper validates the exact request, current policies, and proofs at execution.
6. Read the result before taking any downstream action. The executing service must verify the expected key, exact payload, expiry, and replay or idempotency rules.

Signing and protected key-lifecycle requests use [one-time operation mandates](../../features/mandate/README.md). Hub obtains the mandate under the caller’s permission. CREATE and other direct commands use the current primary credential. A mandate cannot authorize registry writes or WebAuthn preparation.

Reusing the same owner, idempotency key, and business request returns the existing operation or result. Reusing the key with a different request conflicts. A failed operation is terminal; an executing operation or one with an unknown outcome must be checked before any new submission. Hub does not automatically retry an unknown execution outcome.

## Read results and deadlines

Tool results contain `structuredContent` and equivalent JSON text. Check `isError` as well as the HTTP response: a Keeper rejection, terminal execution failure, or unknown outcome is reported as a tool error. A deferred operation awaiting approvals is a successful submission, not a completed action.

Approval receipt counts describe collected material. Keeper performs cryptographic proof verification during execution. Global read access does not allow a client to execute someone else’s operation.

`X-EXPIRES-AT` uses Unix seconds; JSON `expiresAt` values use milliseconds. Enrollment sessions, mandates, and approval windows have separate deadlines. Repeating preparation does not extend the operation’s approval window. See [configuration and deadlines](../api-reference/configuration.md#approval-deadlines).

## Browser clients

Set `hub.mcp.allowed-origins` to the exact trusted frontend origins that may send browser requests. Wildcards, URL paths, credentials, query strings, and fragments are not valid origins. Requests without an `Origin` header still require authentication. Configure browser CORS separately; the origin allowlist does not enable CORS.

MCP responses use `Cache-Control: no-store`. Keep tokens and approval material out of logs and prompts.

## Related guides

- [TKeeper Hub](https://tkeeper.org/hub)
- [OpenAPI Documentation](../api-reference/openapi.md)
- [Authorities and policy](../signing-and-authorities/authorities.md)
- [Four-eye control and WebAuthn](../security-model/four-eye-control.md)
- [Approvers registry](../api-reference/approvers.md)
- [Operation mandates](../../features/mandate/README.md)
- [Agentic payments](agentic-payments/README.md)
