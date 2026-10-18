# TKeeper Java SDK

Use TKeeper from Java to sign governed commands and manage the keys behind your application's identities.
The client connects to Keeper nodes or [TKeeper Hub](https://tkeeper.org/hub). Requires Java 17 or newer.

## Dependency

Maven:

```xml
<dependency>
  <groupId>org.exploit</groupId>
  <artifactId>tkeeper-sdk</artifactId>
  <version>3.0.0</version>
</dependency>
```

Gradle:

```groovy
implementation 'org.exploit:tkeeper-sdk:3.0.0'
```

## Connect to Keeper

Use JWT authentication outside local development:

```java
import org.exploit.tkeeper.sdk.TKeeperClient;
import org.exploit.tkeeper.sdk.auth.JwtTokenAuth;

try (var keeper = new TKeeperClient(
        "https://keeper.example",
        new JwtTokenAuth(jwt)
)) {
    var status = keeper.system().status();
}
```

`DevTokenAuth` and the `TKeeperClient(baseUrl, devToken)` convenience constructor are for development environments.

`keeper.central().getConfig()` returns `threshold`, `total`, sorted loaded module ids
in `features`, sorted supported authority types in `authorities`, and `sealProvider`.
It requires authentication without an additional permission and
works on an initialized sealed Keeper.

## TKeeper Hub

Use [TKeeper Hub](https://tkeeper.org/hub) to coordinate approvals between your service and the people
who review its requests. Your service can submit a signing request, store its operation ID and return
to it after approvals arrive.

Connect to your Hub deployment's origin with an SSO access JWT. The example below uses an existing key
and an `AuthorityCommand`, such as the one in [Governed typed signing](#governed-typed-signing).

```java
import org.exploit.tkeeper.sdk.TKeeperClient;
import org.exploit.tkeeper.sdk.auth.JwtTokenAuth;
import org.exploit.tkeeper.sdk.model.hub.signature.SubmitSignatureRequest;

try (var client = new TKeeperClient("https://hub.example", new JwtTokenAuth(accessJwt))) {
    var hub = client.hub();
    var submitted = hub.signatures().sign(
            new SubmitSignatureRequest(keyId, command),
            idempotencyKey
    );

    if (submitted.operation() != null) {
        var operation = submitted.operation();
        System.out.println(operation.operationId() + ": " + operation.state());
    } else {
        System.out.println(submitted.result().signature64());
    }
}
```

A completed signing call returns its signature in `result()`. When approval is required, HTTP 202
returns a saved operation in `operation()`. Read `hub.approvals().getApprovalStatus(operationId).body()` to
find which approvals are still needed. Once those requirements are met, the request owner can call
`hub.operations().executeOperation(operationId)`. Check the returned operation state: an execution
failure can be reported in an HTTP 200 response.

Choose an idempotency key for each business request and keep it with that request. Reuse it only for
the same action and payload. Signing, composition, refresh, rotation and destruction require it.
After an unknown transport outcome, check the operation journal before submitting again.

Use `hub.keys()` to manage keys and `hub.policies()` to work with authority drafts and releases.
The [Hub API guide](HUB.md) describes the other resources and how to follow operation updates over SSE.

## Governed typed signing

This example assumes the digest-pinned `payments-small` custom authority already exists in the referenced OCI registry.

```java
import org.exploit.tkeeper.sdk.TKeeperClient;
import org.exploit.tkeeper.sdk.auth.JwtTokenAuth;
import org.exploit.tkeeper.sdk.model.*;
import org.exploit.tkeeper.sdk.model.command.AuthorityCommand;
import org.exploit.tkeeper.sdk.model.command.VerificationCommand;
import org.exploit.tkeeper.sdk.model.command.artifact.TypedData;
import org.exploit.tkeeper.sdk.util.TKeeperJackson;

try (var keeper = new TKeeperClient(baseUrl, new JwtTokenAuth(jwt))) {
    var authorities = KeySetAuthorities.of(KeySetAuthority.oci(
            "payments-small",
            "oci://registry.example/verdict/authorities/payments-small@sha256:..."
    ));

    keeper.dkg().generate(new Generate(
            "payments-key",
            KeyAlgorithms.SECP256K1,
            authorities,
            KeyGenMode.CREATE
    ));

    var payload = TKeeperJackson.signingNode()
            .put("amount", 5000)
            .put("currency", "USD");

    var command = AuthorityCommand.of(
            "payments-small",
            new TypedData(SignatureSchemes.ECDSA, HashMethod.SHA256, payload)
    );

    var signature = keeper.signature().sign(Sign.of("payments-key", command));
    var verified = keeper.signature().verify(new Verify(
            "payments-key",
            signature.generation(),
            VerificationCommand.from(command),
            signature.signature64(),
            null
    ));

    if (!Boolean.TRUE.equals(verified.valid())) {
        throw new IllegalStateException("signature verification failed");
    }
}
```

The short `Generate` constructors that omit `KeySetAuthorities` default to `arbitrary` raw signing. Pass authorities explicitly for governed identities.

`Verify` checks the signature against the supplied material and key generation. It validates the material format and key/scheme compatibility but does not load an authority or evaluate policy. Supported material can be verified even if the key's current authority would reject it for signing. `valid: true` does not mean the action is currently authorized.

## Modules

| Client method | API area |
| --- | --- |
| `system()` | initialization, unseal, status, health, readiness |
| `dkg()` | create, rotate, refresh |
| `signature()` | sign and verify |
| `storage()` | trusted-dealer import |
| `quorum()` | mono-to-threshold promotion |
| `destroy()` | generation destruction |
| [`approvals()`](../docs/security-model/four-eye-control.md#webauthn-approvals) | prepare WebAuthn challenges for an exact operation |
| [`approvers()`](../docs/api-reference/approvers.md) | core credential registry, exact versions, filters, and conditional metadata replacement |
| [`mandate()`](../features/mandate/README.md) | authorize an operation for later execution |
| `consistency()` | threshold consistency repair |
| `ecies()` | optional encrypt/decrypt feature |
| [`dryRun()`](../docs/signing-and-authorities/dry-run.md) | optional authority-policy evaluation without execution |
| `compliance()` | asset inventory |
| `expire()` | expiration indexes |
| `audit()` and `integrity()` | audit verification and integrity-key rotation |
| `controlPlane()` | control-plane reads |
| `central()` | peer id, public key, ping and runtime configuration |
| [`hub()`](HUB.md) | signing and approval workflows through Hub, with a saved operation journal |

Feature-specific calls fail when the server artifact does not include the required feature or cryptographic platform.

## Approvals

`Approvals.proofs()` accepts `SignatureProof` for signature approvals and `WebAuthnProof` for browser
assertions. Both implement `Proof` in `org.exploit.tkeeper.sdk.model.approval`. When migrating code
that used `Approvals.Proof`, construct `new SignatureProof(fingerprint, signature64)`. Inspect each
proof's type before accessing its signature or credential fields.

For WebAuthn, `keeper.approvals().prepare(new PrepareApprovals(type, operationJson))` returns a
signed binding and browser request options. Attach the browser assertion with
`new WebAuthnProof(fingerprint, prepared.binding(), assertionJson)`. Preparation uses primary
authentication and the enclosed operation's permission. Execution can use JWT or a previously
issued mandate. See the [complete collection flow](../docs/security-model/four-eye-control.md#webauthn-approvals).

## Approvers

```java
import org.exploit.tkeeper.sdk.model.approver.*;
import java.util.List;
import java.util.Map;

var registered = keeper.approvers().register(new RegisterApprover(
        "alice", new SignatureCredentialRegistration("ED25519", publicKey64),
        Map.of("team", "treasury")
));
var current = keeper.approvers().get(registered.ref());
var updated = keeper.approvers().replaceMetadata(
        current.ref(), current.metadataRevision(), Map.of("team", "operations")
);
var page = keeper.approvers().list(new ApproverFilter(
        "alice", ApproverType.SIGNATURE, Map.of("team", "operations"), null, 50
));
```

Registration, reads and metadata replacement require `tkeeper.approvers.register`,
`tkeeper.approvers.read` and `tkeeper.approvers.metadata` respectively. The permissions are
independent. The module URL-encodes complete refs and sends the quoted revision as `If-Match`.
Reconcile `APPROVER_METADATA_REVISION_MISMATCH` by reading the current record before retrying.
Registration and metadata updates require every current member online and persisted before
success. Requests may use any peer. A 503 can leave durable reservations or deliveries. Surviving
members finish fully confirmed deliveries after writer failure. TTL limits new WebAuthn/PREPARE
confirmations; partial signed reservations keep their protective locks until coordinated settlement.
An identical registration retry is safe. Pin the returned ref in a key policy:

```java
var fourEye = KeySetPolicy.FourEyeControlPolicy.of(2, 2, List.of(
        new KeySetPolicy.FourEyeControlPolicy.Reference(alice.ref()),
        new KeySetPolicy.FourEyeControlPolicy.Reference(bob.ref())
));
var policy = KeySetPolicy.builder().fourEye(fourEye).build();
```

FourEye permits `1 <= m <= n <= 256`, including `1 of 1` and `1 of n` with Signature or WebAuthn refs.

An OCI authority's `policy.approvers` values likewise accept `{ref: "id@sha256:<digest>"}`.
References pin the exact credential and approval method; metadata and new registrations do
not change existing policies. Key policies can mix `Reference` and legacy `PublicKey` entries.
`ApprovalRequirement.approvers()` values decode as `Approver` or
`model.authority.RegistryApprover`; rules still select their manifest aliases.
When reading `fourEye.keys()` or `ApprovalRequirement.approvers()`, check the entry type
before accessing inline key fields.

For a browser application connected directly to Keeper, obtain creation options and finish with
the browser's credential JSON. Hub invitations use the flow in the [Hub API guide](HUB.md#approvers-and-deadlines).

```java
var options = client.approvers().webAuthnRegistrationOptions(
        new WebAuthnRegistrationOptionsRequest("alice", Map.of("team", "treasury"))
);
// Pass options.publicKey() to the browser and receive its serialized credential.
var approver = client.approvers().finishWebAuthnRegistration(
        new WebAuthnRegistrationFinishRequest(options.invitation(), credentialJson)
);
```

Issuing options requires `tkeeper.approvers.register`. Pass `options.invitation()` and the browser
options to the intended credential holder. The holder finishes using a client authenticated with
their own JWT and can target another peer. Finish requires both the JWT and invitation, with no
additional registry permission. The public
`registrationId()` is only a session identifier. Identical finish retries return the same record;
another response cannot reuse the invitation. Returned credentials decode as `SignatureCredential`
or `WebAuthnApproverCredential`.
Configure `keeper.webauthn` on the cluster for the browser application's RP ID and exact frontend origins.

## Errors

Direct Keeper calls throw `TKeeperException` for HTTP failures. Branch on the stable `ErrorType`;
use `details` only for diagnostics.

| Error family | Handling |
| --- | --- |
| `ACCESS_DENIED`, `POLICY_VIOLATION` | reject; do not retry unchanged input |
| `APPROVAL_REQUIRED` | collect every group from `TKeeperException.getApprovals()`, [build and sign `hashForSigning`](../docs/security-model/four-eye-control.md#building-hashforsigning), and resubmit once |
| validation and authority errors | fix the request, authority, or server artifact |
| `SESSION_MAX_ROUNDS_EXCEEDED`, quorum, audit, or timeout errors | retry only under a bounded availability policy |
| non-empty `imposters` | preserve as security evidence and investigate the named peers |

Do not blindly retry policy, permission, or validation failures. Preserve `imposters` and `dead` as security and availability diagnostics.

Hub HTTP failures throw `HubException`. Inspect its status and structured error body to decide how to
handle the failure. `requiresSignIn()` identifies a Hub session that needs authentication; a forwarded
Keeper 401 alone does not require a new Hub session. See [Hub errors](HUB.md#errors-and-tests).

## Contract

The [Keeper OpenAPI](../openapi.yaml) defines the node API's routes and wire models.
The [Hub API guide](HUB.md) covers Hub responses, approval workflows and operation events.
