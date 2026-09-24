# MCP

The `mcp` feature adds `POST /mcp` to TKeeper's public HTTP server. An agent host can discover permitted identities and authorities, read command schemas, verify signatures, and request governed signing or composition. The host holds the Keeper token and sends it with each request.

## What the tools provide

| Tools | Result | Permission |
| --- | --- | --- |
| `identity.list`, `identity.describe_authority` | Active signing identities, authority descriptions, command JSON Schemas | `tkeeper.key.<keyId>.sign` |
| `utility.keeper_status` | Sealed and ready state | `tkeeper.system.status` |
| `utility.get_public_key` | Public key for an identity | `tkeeper.key.<keyId>.public` |
| `utility.verify_signature` | Cryptographic command verification | `tkeeper.key.<keyId>.verify` |
| `action.sign`, `action.compose` | Signature or [composed result](../signing-and-authorities/composer.md) | `tkeeper.key.<keyId>.sign` |

`tools/list` shows tools available to the caller. Each tool call checks permission again for its target key. `identity.describe_authority` exposes the input schema; the attached authority and policy decide whether a submitted command may be signed.

## Connect an agent host

1. Build Keeper with `mcp` and the authority features the host needs. `mcp` is an explicit build selector, including when `keeper.features=all` is selected:

   ```sh
   ./gradlew :build -Pkeeper.features=mcp,digital-assets,agentic-payments -Pkeeper.platforms=ecc
   ```

   For local developer authentication, also select `auth-dev` and follow the [single-node setup](../getting-started/local-single-node.md).

2. Run Keeper with its normal [public server and authentication configuration](../security-model/authentication-authorization.md). Create a key with an authority before expecting it in `identity.list`. MCP uses the same public port; there is no separate MCP process.

3. Configure the agent host for Streamable HTTP at `https://<keeper-public-host>/mcp`. It must support MCP version `2026-07-28`, the `server/discover`, `tools/list`, and `tools/call` methods, and custom request headers:

   | Authentication mode | Request header |
   | --- | --- |
   | Production JWT | `X-JWT-TOKEN: <raw-jwt>` |
   | Local `auth-dev` | `X-DEV-TOKEN: <dev-token>` |

   Send the token from the host on every request. Browser requests with an `Origin` header are rejected, so connect from a server-side host. Keeper accepts HTTP POST and returns JSON.

## Check the connection

With a JWT for the agent host, list the available tools:

```sh
curl -sS 'https://<keeper-public-host>/mcp' \
  -H 'X-JWT-TOKEN: <raw-jwt>' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

For `tools/call`, set `Mcp-Method: tools/call`, set `Mcp-Name` to the tool name, and supply the same name plus `arguments` in `params`. The response places a tool's data in `result.structuredContent`; tool failures set `result.isError: true`. Discovery and tool lists have `ttlMs: 0` and `cacheScope: private`, so refresh them after permission or authority changes.

## Govern signing

Attach a digest-pinned authority to each signing key and grant the host `tkeeper.key.<keyId>.sign` only for the keys it may use. `action.sign` and `action.compose` run the regular policy, approval, audit, and signing pipeline. The system that performs the action must verify the returned proof and enforce freshness or replay rules.

[For AI](../use-cases/for-ai.md#govern-an-mcp-action) has a complete governed action and `tools/call` request. See [agentic payment authorities](agentic-payments/README.md) and [digital asset authorities](../digital-assets/README.md) for command examples. The [feature reference](../../features/mcp/README.md) lists each tool.
