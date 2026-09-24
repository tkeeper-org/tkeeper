# For AI

TKeeper lets an agent host discover permitted identities and request signatures through MCP. An authority document limits what each identity can sign. The system that performs the action verifies the signature before acting.

## MCP

Build the `mcp` feature with the authority modules the agent needs:

```sh
./gradlew shadowJar -Pkeeper.features=mcp,agentic-payments,digital-assets -Pkeeper.platforms=ecc
```

`POST /mcp` serves [MCP `2026-07-28`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx) over Streamable HTTP. It uses the public Keeper server's authentication. The agent host supplies its Keeper token; the model does not need the token. The endpoint supports `server/discover`, `tools/list`, and `tools/call`.

| Tool | Permission | Use |
| --- | --- | --- |
| `identity.list`, `identity.describe_authority` | `tkeeper.key.<keyId>.sign` | Find active signing identities and their command schemas |
| `utility.keeper_status` | `tkeeper.system.status` | Check readiness |
| `utility.get_public_key` | `tkeeper.key.<keyId>.public` | Read a public key |
| `utility.verify_signature` | `tkeeper.key.<keyId>.verify` | Verify a command signature |
| `action.sign`, `action.compose` | `tkeeper.key.<keyId>.sign` | Sign; compose a credential or transaction when supported |

The tool list reflects the token's permissions. Every call checks permission again for its target key. `identity.describe_authority` returns `metadata.description` and a JSON Schema for the command. The schema describes valid input; the authority policy decides whether that input is allowed. See [MCP connection and tools](../ai/mcp.md) for setup and the full tool list.

## Govern an MCP action

This authority permits one agent identity to authorize a restart of `billing-api` in production:

```yaml
schemaVersion: verdict.authority/v1
id: billing-api-restart
type: custom
version: 1.0.0
metadata:
  description: Authorize a billing-api restart in production.
config:
  fields:
    operation: { type: string }
    service: { type: string }
    environment: { type: string }
    changeId: { type: string }
    nonce: { type: string }
    expiresAt: { type: time }
  effects:
    - type: service.restart
      fields:
        service: "$service"
        environment: "$environment"
policy:
  id: billing-api-restart
  fallback: DENY
  allow:
    - id: restart-billing-api
      where:
        - "operation == 'restart'"
        - "service == 'billing-api' && environment == 'production'"
        - "effect.one(effects, 'service.restart')"
```

Attach the authority to the signing key through a digest-pinned OCI reference. Give the agent host `tkeeper.key.<keyId>.sign` only for that key. It can call `identity.describe_authority` to inspect the command schema, then submit:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: action.sign
X-JWT-TOKEN: <raw-jwt>

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"action.sign","arguments":{"keyId":"agent-billing","command":{"type":"custom","authorityId":"billing-api-restart","artifact":{"scheme":"ECDSA","hash":"SHA256","typed":{"operation":"restart","service":"billing-api","environment":"production","changeId":"CHG-42","nonce":"n-123","expiresAt":"2030-01-02T03:04:05Z"}}}},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
```

The restart service verifies the signature against `agent-billing` and the exact typed command, checks `expiresAt` and consumes `nonce` once. The policy limits the service and environment; the backend enforces replay protection. Changes to the fields, effect mapping, or policy require a new authority digest. Add [four-eye approval](../security-model/four-eye-control.md) to the rule when a person must approve the restart. The action must have no path around the verifying service.

## Agentic payments

The `agentic-payments` feature adds AP2 (`ap2.mandate`) and Mastercard Verifiable Intent (`mcintent.mandate`). Both require a P-256 key and ES256. A policy can limit merchants, payment methods, each purchase, and the total request. For example, the [AP2 purchase authority](../ai/agentic-payments/ap2.md) allows the configured shop and card, at most USD 100 per purchase and USD 150 per request; the [MC VI authority](../ai/agentic-payments/mcintent.md) applies the same limits.

```java
var artifact = new Ap2Mandates(PaymentRequestMode.PAIRED, signingInput, disclosures);
var command = Command.of("test:ap2/purchases", artifact);
var credential = client.signature().compose(
        Sign.of(p256KeyId, command), PaymentCredential.class).credential();
```

`signingInput` is the encoded JWS header and payload joined by `.`; `disclosures` contains every referenced SD-JWT disclosure. Keeper checks their commitments, runs the authority policy, signs the exact JWS input, and returns a credential layer. Use `McMandates` for MC VI. The recipient must verify the credential chain, audience, expiry, replay rules, and merchant identity.
