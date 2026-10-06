# Mandates

The optional `mandate` module authorizes a specific operation for later execution, after the client collects approvals. A mandate contains signatures from at least the cluster threshold of distinct peers, including its coordinator. Each issuing peer checks the forwarded primary credential, the operation permission, and its current policies.

Include the module with `-Pkeeper.features=mandate` when building the runtime, or `-Pkeeper.docker.features=mandate` for a Docker build. The `all` feature selector does not enable it.

## Issue a mandate

Send `POST /v1/keeper/mandate` to the coordinator over TLS with a valid primary credential. With JWT authentication, use `X-JWT-TOKEN`. A mandate cannot issue another mandate.

The request contains a registered operation type, the normal operation body, and an expiration timestamp in Unix milliseconds. Core operation types are `sign`, `dkg`, and `destroy`; optional modules can register more types through `GrantOperationProvider` and `HasGrantBinding`.

For example, to authorize destruction of a specific generation:

```json
{
  "type": "destroy",
  "operation": {
    "keyId": "treasury",
    "generation": 1
  },
  "expiresAt": 1800000300000
}
```

Choose `expiresAt` relative to the current time. The example timestamp is illustrative. The primary credential must grant `tkeeper.key.treasury.destroy`.

An allowed request returns:

```json
{
  "mandate": "<opaque token>",
  "expiresAt": 1800000300000,
  "requirements": [],
  "verdict": "ALLOW"
}
```

When approvals are needed, the verdict is `ALLOW_WITH_REQUIREMENTS`. Each requirement group contains its threshold, approver public keys, and policy details when available. All groups must be satisfied. A denied request returns the existing authorization or policy error and no mandate. Issuance does not consume the operation's approval nonce or execute the operation.

## Execute the operation

Submit the normal operation body to its existing endpoint with `X-KEEPER-MANDATE: <opaque token>`. Use only the mandate credential for that request. Add the required approval envelope to the body before execution.

The signed scope includes the operation type, key ID, exact permission, and a hash of all semantic operation fields. The approval envelope is excluded so proofs can be collected after issuance. Current policies and every required approval group are checked again before admission.

The mandate also binds its actor, coordinator, execution nonce, lifetime, and attempt budget. DKG mandates bind one target generation. Issuance requires consistent DKG state without a pending generation; execution does not perform implicit consistency repair.

## Lifetime and retries

`keeper.mandate.max-ttl` defaults to the smaller of 15 minutes and `keeper.nonce-ttl`. An explicit maximum must be positive and must not exceed nonce retention. `keeper.mandate.max-attempts` defaults to `12` and accepts values from `1` to `1024`. Both limits are signed into the issued mandate, and every peer applies its own configured limits.

A public launch is admitted once by its signed coordinator. Native protocol retries may create new sessions and change the quorum under the same execution nonce. Each participating node admits an attempt ID once and persists the attempt count until expiry. A different coordinator, a repeated attempt ID, or an exhausted budget is rejected.

Accepted retries can produce multiple signatures for the same authorized body if the coordinator is compromised. Systems executing signed commands must enforce business idempotency with a nonce or operation identifier in that body.

## Token signing keys

JWT mandates bind the original issuer, configured audience, `kid`, and the RFC 7638 thumbprint of the trusted public JWK that verified the token. The original JWT may expire before execution. Removing its signing key from the current JWKS, or replacing the key under the same `kid`, invalidates the mandate after the configured JWKS refresh.

Witness signatures are checked against trusted keeper integrity keys through the existing peer transport and boot verification. Integrity-key changes can invalidate outstanding mandates when a peer's trusted current key no longer matches a witness. The mandate token is a bearer credential; store it with the same care as the authorized request.

Mandates support up to 32 witness signatures. Large thresholds with post-quantum witness signatures need a larger HTTP header budget. Keeper allows a header block of about 288 KiB when the mandate provider is loaded, with the token itself capped at 256 KiB. Reverse proxies must allow the same header size if those large tokens are used.

Internal endpoints are `POST /v1/mandate/issue` for peer witness issuance and `GET /v1/mandate/identity` for establishing a signed peer identity. They use normal keeper transport authentication; witness issuance additionally requires the forwarded primary credential.

Deploy this core change to all peers together. Signed actor requests now bind the credential header as well as its token; older peers use a different request hash and cannot participate in these requests with updated peers.

## Java SDK

Use a primary-authenticated client to issue a mandate. The operation stays a `JsonNode`, allowing optional modules to supply their own registered bodies:

```java
var request = new IssueMandate("destroy", mapper.valueToTree(operation), expiresAt);
var issued = primaryClient.mandate().issue(request);
```

Create a client with `new MandateTokenAuth(issued.mandate())` for execution. Send the same operation through its normal SDK module, including any approvals collected from `issued.requirements()`.

The SDK's default client supports the 288 KiB header budget. If supplying your own `Jettyx` instance, configure its builder with `.customize(client -> client.setMaxRequestHeadersSize(288 * 1024))` before building it.
