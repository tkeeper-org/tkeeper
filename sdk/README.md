# TKeeper Java SDK

The SDK is a Java 17 client for the current TKeeper HTTP API.

## Dependency

Maven:

```xml
<dependency>
  <groupId>org.exploit</groupId>
  <artifactId>tkeeper-sdk</artifactId>
  <version>2.5.0</version>
</dependency>
```

Gradle:

```groovy
implementation 'org.exploit:tkeeper-sdk:2.5.0'
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

`Verify` is a cryptographic operation, not a policy reassessment. Its `VerificationCommand` may contain any supported material type, including typed or arbitrary material, regardless of the key's current authority manifest. The server still validates the material shape and key/scheme compatibility; `valid: true` proves only that the signature matches that material and key generation.

## Modules

| Client method | API area |
| --- | --- |
| `system()` | initialization, unseal, status, health, readiness |
| `dkg()` | create, rotate, refresh |
| `signature()` | sign and verify |
| `storage()` | trusted-dealer import |
| `quorum()` | mono-to-threshold promotion |
| `destroy()` | generation destruction |
| `consistency()` | threshold consistency repair |
| `ecies()` | optional encrypt/decrypt feature |
| [`dryRun()`](../docs/signing-and-authorities/dry-run.md) | optional authority-policy evaluation without execution |
| `compliance()` | asset inventory |
| `expire()` | expiration indexes |
| `audit()` and `integrity()` | audit verification and integrity-key rotation |
| `controlPlane()` | control-plane reads |

Feature-specific calls fail when the server artifact does not include the required feature or cryptographic platform.

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

[`../openapi.yaml`](../openapi.yaml) is the source of truth for routes and wire models. If an SDK helper and OpenAPI disagree, update the SDK rather than coding against the stale helper behavior.
