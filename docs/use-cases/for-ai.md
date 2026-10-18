# For AI

Connect an AI agent to TKeeper through MCP using [TKeeper Hub](https://tkeeper.org/hub).
Keeper's authority policies govern what each identity may sign. The system that performs
an action verifies the returned signature before acting.

Build the authority modules the workflow needs:

```sh
./gradlew shadowJar -Pkeeper.features=agentic-payments,digital-assets -Pkeeper.platforms=ecc
```

The core identity catalog exposes the caller's permitted signing keys and their command
schemas. See [MCP through TKeeper Hub](../ai/mcp.md) for the integration boundary and Keeper APIs.

## Govern an action

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

Attach the authority to the signing key through a digest-pinned OCI reference. Give the agent host `tkeeper.key.<keyId>.sign` only for that key. It can inspect the command schema through the identity catalog, then submit:

```http
POST /v2/keeper/sign HTTP/1.1
Content-Type: application/json
X-JWT-TOKEN: <raw-jwt>

{
  "keyId": "agent-billing",
  "command": {
    "type": "custom",
    "authorityId": "billing-api-restart",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "operation": "restart",
        "service": "billing-api",
        "environment": "production",
        "changeId": "CHG-42",
        "nonce": "n-123",
        "expiresAt": "2030-01-02T03:04:05Z"
      }
    }
  }
}
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
