# TKeeper Java SDK

The SDK provides a typed client for the TKeeper HTTP API and requires Java 17 or newer.

## Dependency

Maven:

```xml
<dependency>
  <groupId>org.exploit</groupId>
  <artifactId>tkeeper-sdk</artifactId>
  <version>2.6.0</version>
</dependency>
```

Gradle:

```groovy
implementation 'org.exploit:tkeeper-sdk:2.6.0'
```

## Client

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
| [`approvers()`](../docs/api-reference/approvers.md) | core credential registry, exact versions, filters, and conditional metadata replacement |
| [`mandate()`](../features/mandate/README.md) | authorize an operation for later execution |
| `consistency()` | threshold consistency repair |
| `ecies()` | optional encrypt/decrypt feature |
| [`dryRun()`](../docs/signing-and-authorities/dry-run.md) | optional authority-policy evaluation without execution |
| `compliance()` | asset inventory |
| `expire()` | expiration indexes |
| `audit()` and `integrity()` | audit verification and integrity-key rotation |
| `controlPlane()` | control-plane reads |

Feature-specific calls fail when the server artifact does not include the required feature or cryptographic platform.

## Approvers

```java
import org.exploit.tkeeper.sdk.model.approver.*;
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
Audit `ApprovalRequirement.approvers` values decode as `Approver` or
`model.authority.RegistryApprover`; rules still select their manifest aliases.
When reading `fourEye.keys()` or `ApprovalRequirement.approvers()`, check the entry type
before accessing inline key fields. Existing inline constructors and policy builders remain available.

For a WebAuthn hub, obtain standard browser creation options and finish with browser credential JSON:

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
Configure `keeper.webauthn` on the cluster for the hub's RP ID and exact frontend origins.

## Errors

Non-success responses throw `TKeeperException`. Branch on the stable `ErrorType`; use `details` only for diagnostics.

| Error family | Handling |
| --- | --- |
| `ACCESS_DENIED`, `POLICY_VIOLATION` | reject; do not retry unchanged input |
| `APPROVAL_REQUIRED` | collect every group from `TKeeperException.getApprovals()`, [build and sign `hashForSigning`](../docs/security-model/four-eye-control.md#building-hashforsigning), and resubmit once |
| validation and authority errors | fix the request, authority, or server artifact |
| `SESSION_MAX_ROUNDS_EXCEEDED`, quorum, audit, or timeout errors | retry only under a bounded availability policy |
| non-empty `imposters` | preserve as security evidence and investigate the named peers |

Do not blindly retry policy, permission, or validation failures. Preserve `imposters` and `dead` as security and availability diagnostics.

## Contract

[OpenAPI](../openapi.yaml) defines the routes and wire models. Report discrepancies between the SDK, server, and specification as API contract bugs.
