# MCP tools

Build with `-Pkeeper.features=mcp` to add `POST /mcp` to Keeper's existing public HTTP server. It uses the same authentication provider and token as the other public endpoints. The agent host supplies the token; this module does not issue credentials.

The endpoint supports MCP `2026-07-28` over Streamable HTTP with JSON responses. Tools are grouped by name:

- `identity.list`: paged active keys the caller can sign with, their algorithms, generations, and authority IDs.
- `identity.describe_authority`: an authority's `metadata.description` and the JSON Schema of its `{type, authorityId, artifact}` command.
- `utility.keeper_status`: sealed and ready state. Requires `tkeeper.system.status`.
- `utility.get_public_key`: public key for an identity. Requires `tkeeper.key.<keyId>.public`.
- `utility.verify_signature`: verify a signature for an identity and command. Requires `tkeeper.key.<keyId>.verify`.
- `action.sign`: sign an authority command. Requires `tkeeper.key.<keyId>.sign`.
- `action.compose`: sign and compose a transaction. Requires `tkeeper.key.<keyId>.sign`.

`tools/list` only advertises tools for which the caller has an applicable permission. Every call checks permission again for its target key. Signing and compose run the same authority and approval guards as the regular API. Each artifact deserializer supplies its own artifact schema; the schema describes command shape, while the authority policy decides whether a particular transaction is allowed.

`server/discover` and `tools/list` return `ttlMs: 0` and `cacheScope: private`. Refresh the catalog after a permission, identity, or authority change.

Example request with Keeper's production JWT header:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: identity.describe_authority
X-JWT-TOKEN: <raw-jwt>

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"identity.describe_authority","arguments":{"keyId":"example-key","authorityId":"example-authority"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
```

`server/discover` and `tools/list` are also supported. Browser requests with an `Origin` header are rejected; connect from a server-side agent host.

See [MCP connection and tools](../../docs/ai/mcp.md) for setup and [For AI](../../docs/use-cases/for-ai.md#govern-an-mcp-action) for a governed tool call.
