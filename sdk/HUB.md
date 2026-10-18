# TKeeper Hub API

`TKeeperClient.hub()` implements the TKeeper Hub REST contract, grouped by resource. Set the client base URL to the Hub origin, for example `https://hub.example`, without `/v1` or a Keeper path.

```java
import org.exploit.tkeeper.sdk.TKeeperClient;
import org.exploit.tkeeper.sdk.auth.JwtTokenAuth;

try (var client = new TKeeperClient("https://hub.example", new JwtTokenAuth(accessJwt))) {
    var session = client.hub().session().getSession().body();
    var peers = client.hub().system().listKeeperPeers().body();
}
```

Hub calls send the existing SSO JWT as `Authorization: Bearer <token>`. `JwtTokenAuth` is adapted for Hub calls; native Keeper calls retain their `X-JWT-TOKEN` behavior. Jettyx `BearerAuth` is also supported. Public authentication discovery, `hub().session().getAuthenticationConfig()`, omits authentication.

| Accessor | Contract area |
| --- | --- |
| `session()` | public OIDC configuration and verified session |
| `keys()` | capabilities, authority resolution, create, import, refresh, rotate, destroy, quorum promotion and public keys |
| `identities()` | native identity catalog and authority schemas |
| `signatures()` | sign, compose, verify and policy emulation |
| `operations()` | journal, history, execution, cancellation and SSE |
| `approvals()` | preparation, status, WebAuthn receipts and signature receipts |
| `approvers()` | registry, conditional metadata, capabilities, self credentials and invitations |
| `policies()` | capabilities, drafts, validation, releases, registry, imports, templates and help |
| `compliance()` | inventory and audit verification |
| `expirations()` | inventory, apply, process and expired entries |
| `system()` | Hub capabilities, peer discovery and native peer maintenance |

Methods use the OpenAPI operation IDs. Optional query parameters can be passed as `null`; overloads omit them. Peer selectors are configured peer IDs, passed as `peerId`, rather than origins. Cursors are opaque and preserved unchanged. `ApproverFilter.metadata()` accepts bare keys such as `team`; the SDK sends `metadata.team`.

## Responses and submissions

Ordinary methods return `HttpResponse<T>` with `status()`, `headers()` and typed `body()`. Successful empty responses have a null body. This includes HTTP 204 and the destroy endpoint's HTTP 299. Refresh, rotate and destroy can instead return HTTP 202 with `OperationView` in `body()`.

Signing and composition return `HubCommandResult<T>`. HTTP 200 contains the native result in `result()`; HTTP 202 contains the saved operation in `operation()`.

```java
import org.exploit.tkeeper.sdk.model.command.AuthorityCommand;
import org.exploit.tkeeper.sdk.model.hub.signature.SubmitSignatureRequest;

var request = new SubmitSignatureRequest(keyId, command);
var submitted = client.hub().signatures().sign(request, idempotencyKey);
if (submitted.status() == 202) {
    var operation = submitted.operation();
    // Review requirements and collect receipts for operation.operationId().
} else {
    var signature = submitted.result();
}
```

`Idempotency-Key` is mandatory for refresh, rotate, destroy, sign and compose. Choose it at the business-operation boundary and retain it with the exact request. The SDK does not retry mutations or reconnect SSE automatically. An unknown transport outcome requires reconciliation before another submission.

`compose(request, idempotencyKey)` returns a JSON result. Its overload with `Class<T>` decodes the result into existing native models such as `SignedEvmTransaction`, `SignedSolanaTransaction`, `PaymentCredential` or `ThresholdSignature`.

Hub-specific requests live under `model.hub`. Lifecycle requests fix their respective mode. Refresh, rotate, destroy and signing accept `InitialApprovals` with empty proofs; omit it to let Hub assign the approval context. Omitted refresh/rotate policy stays omitted: Hub does not inherit the previous policy. Hub execution mandates are managed by the server.

`executeOperation(operationId)` executes the collected receipts. Its overload accepts `OperationExecuteRequest` for the contract's legacy owner-supplied proofs. Inspect the returned operation state: an HTTP 200 execution response can contain `FAILED` or `OUTCOME_UNKNOWN`.

Native catalog responses preserve `isError` and the complete `result` payload. Check `isError` even when HTTP succeeds; `catalog()` and `authority()` expose the existing typed native models, and `error()` exposes native error details. Authority configuration, command schemas and operation request/result objects retain their open JSON structure.

## Approvers and deadlines

Registration and metadata responses retain `ETag`. Pass it unchanged to `replaceApproverMetadata(ref, request, etag)`; the SDK sends the quoted value as `If-Match`.

Hub invitation requests use `invitationToken`. Native Keeper registration's separate invitation format is not substituted. WebAuthn creation/assertion JSON has typed models under `model.hub.webauthn`; binary browser fields remain base64url strings.

Hub dates remain RFC 3339 strings. WebAuthn JSON `expiresAt` values remain Unix milliseconds, while native `X-EXPIRES-AT` headers remain Unix seconds. Reads and explicit retries do not renew deadlines.

## SSE

```java
String lastEventId = null;
try (var events = client.hub().operations().observeOperationEvents(operationId, lastEventId)) {
    org.exploit.tkeeper.sdk.model.hub.operation.OperationEvent event;
    while ((event = events.read()) != null) {
        lastEventId = events.lastEventId();
        // Consume event and persist the resume position as needed.
    }
}
```

Events are delivered as they arrive. EOF ends one connection; explicitly reconnect with the last received ID. Omit the ID to replay from the beginning. The stream accepts a signed int64 version of at least -1, exposes response headers and closes through either its own `close()` or the owning client.

## Errors and tests

HTTP failures throw `HubException`, preserving status, headers, raw body and parsed JSON when available. `getProblem()`, `getKeeperError()` and `getValidation()` expose the contract's structured error variants. Empty and non-JSON gateway errors still retain their HTTP diagnostics. `requiresSignIn()` checks `X-Hub-Session: required`; a forwarded native 401 alone does not request a new Hub session. `HubProblem.outcome()` preserves `NOT_SENT`, `UNKNOWN` or null.

Run the SDK unit suite with `./gradlew :sdk:test`. Its standalone [contract snapshot](src/test/resources/hub/openapi.json) covers all 83 operations, every documented success status, models, required nulls, request encoding, headers, error envelopes, mutation retry behavior and streaming/resume behavior. Tests use local HTTP stubs. They also check the original OpenAPI SHA-256 when the sibling `tkeeper-hub` checkout is available.
