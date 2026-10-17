# Agent integration

Keeper no longer includes the `mcp` feature or `POST /mcp`. Existing MCP hosts need
an external adapter or must call the public HTTP API directly. Remove `mcp` from
build selectors.

The host keeps the Keeper JWT and sends it in `X-JWT-TOKEN` on every request.
Grant it signing access only to the identities it needs.

| Task | Public endpoint | Permission |
| --- | --- | --- |
| Discover active identities | `GET /v1/keeper/control/identities` | `tkeeper.key.<keyId>.sign`, filtered per item |
| Read an attached authority and command schema | `GET /v1/keeper/control/identities/authority?keyId=<keyId>&authorityId=<authorityId>` | `tkeeper.key.<keyId>.sign` |
| Read runtime modules and authority types | `GET /v2/keeper/config` | primary authentication |
| Read a public key | `GET /v1/keeper/publicKey?keyId=<keyId>` | `tkeeper.key.<keyId>.public` |
| Verify a command signature | `POST /v2/keeper/sign/verify` | `tkeeper.key.<keyId>.verify` |
| Sign or compose a command | `POST /v2/keeper/sign`, `POST /v2/keeper/compose` | `tkeeper.key.<keyId>.sign` |

Identity discovery and authority schemas are part of core. No optional module is
needed for these endpoints. See [pagination and SDK methods](../api-reference/configuration.md#identity-catalog).

```sh
curl -sS 'https://<keeper-public-host>/v1/keeper/control/identities?limit=50' \
  -H 'X-JWT-TOKEN: <raw-jwt>'
```

Signing and composition use the normal policy, approval and audit checks. A command
schema describes valid input; the authority policy decides whether it may execute.
The system performing the action must verify the expected key, exact command,
expiry and replay rules.

[For AI](../use-cases/for-ai.md#govern-an-action) shows a governed action. Payment
examples are in [agentic payment authorities](agentic-payments/README.md).
