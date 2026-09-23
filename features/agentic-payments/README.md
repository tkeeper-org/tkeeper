# Agentic payments

AP2 and Mastercard Verifiable Intent use the same authority, approval, signing and
verification pipeline as the other keeper authority modules.

```sh
./gradlew shadowJar -Pkeeper.features=agentic-payments -Pkeeper.platforms=ecc
```

Select `ap2` or `mc-vi` independently when only one is needed. Their dependencies are
`org.exploit.verdict:ap2:0.2.0` and
`org.exploit.verdict:mc-vi:0.2.0`; shared request validation and CEL
functions come from `org.exploit.verdict:payments:0.2.0`.

## Authority

Use `type: ap2.mandate` or `type: mcintent.mandate`.
`config.merchants` and `config.methods` are the named identity catalogs validated
by Verdict. `config.mode` is `PAIRED` by default; explicitly select `PAYMENTS` or
`CHECKOUTS` for a standalone signing stage. The artifact mode must match it.

The policy receives Verdict's action schema: `action`, `payment`, `checkout`,
`delegation`, `request`, `mandates`, `context`, `merchants`, and `methods`.
Every action is evaluated; a denied action denies the complete request, and all
approval requirements are retained. `context` is empty.

See the executable [AP2 authority](../../integration-tests/src/testFixtures/resources/authorities/payments/ap2-purchases.yaml)
and [MC VI authority](../../integration-tests/src/testFixtures/resources/authorities/payments/mcintent-purchases.yaml).
The [agentic payment authority guide](../../docs/signing-and-authorities/agentic-payments.md) has a policy and SDK example.

## SDK and signing contract

```java
var artifact = new Ap2Mandates(
        PaymentRequestMode.PAIRED,
        protectedHeaderBase64Url + "." + payloadBase64Url,
        encodedDisclosures);
var command = Command.of("test:ap2/purchases", artifact);
var result = client.signature().compose(Sign.of(p256KeyId, command), PaymentCredential.class);
String credential = result.credential();
```

Use `McMandates` for MC VI. `signingInput` contains exactly two unpadded base64url
segments: the protected JWS header and payload. Supply every disclosure referenced
by `delegate_payload`, including nested disclosures. Keeper verifies their SHA-256
commitments and reconstructs the mandates before running Verdict. Missing,
duplicate, unreferenced or colliding disclosures fail closed. Signing requires
complete disclosure even though subsequent presentations may disclose a subset.
The supported top-level `_sd` index, when present, mirrors `delegate_payload`
(the VI profile). Other top-level selectively disclosed claims are not supported.

The signed bytes are the **unchanged ASCII `signingInput`**. ES256 fixes the signing
scheme to ECDSA, the key to P-256 and the digest to SHA-256. Caller-selected
`scheme`/`hash` and detached `mandates`/`checkoutJson` fields are rejected.
A closed checkout's content comes exclusively from its `checkout_jwt` payload;
`checkout_hash` must equal `base64url(SHA256(ASCII(checkout_jwt)))`. Open checkout
references use the hash of the actual encoded disclosure. Verdict checks pair
references, agent bindings, complete request contents and authority policies.

AP2 supports trusted-provider SD-JWT (`dc+sd-jwt`/`sd+jwt`) and delegated KB-SD-JWT.
MC VI supports L2 Immediate/Autonomous (`kb-sd-jwt`/`kb-sd-jwt+kb`) and terminal L3
(`kb-sd-jwt` with an explicit PAYMENTS or CHECKOUTS authority mode). VI uses ES256,
`sha-256`, required binding claims, compatible mandate kinds and P-256 public agent
JWKs; L3 requires `kid` and a validity interval of at most one hour.

The signing adapter validates the outgoing credential and its content commitments.
The caller supplies issuer/audience/nonce/time claims and `sd_hash` computed from
the exact parent presentation. Parent-chain authentication, trust roots, replay,
expiry at presentation time and merchant-signature verification belong to the
credential verifier. Parsing a merchant JWT here establishes its content binding,
not the merchant's identity. Composer does not authenticate parent credentials.

`POST /v2/keeper/compose` accepts the same `Sign` request as `/v2/keeper/sign`.
It uses the same authority, approval and signing pipeline, then returns:

```json
{
  "type": "ap2.mandate",
  "credential": "<header>.<payload>.<signature>~<disclosure-1>~<disclosure-2>~",
  "generation": 1,
  "imposters": []
}
```

MC VI returns `type: mcintent.mandate` with the same combined serialization; its
protected JWT `typ` distinguishes Immediate, Autonomous and terminal credentials.
The string is ready to use as the signed SD-JWT/KB-SD-JWT layer. Composer preserves
the exact signing input and disclosure strings/order, encodes ES256 as the 64-byte
`R || S` signature in unpadded base64url, and includes the trailing `~`.
For delegated credentials, present this layer alongside the existing parent
credential(s) bound by `sd_hash`; Keeper cannot reconstruct that chain from a hash.
All supplied disclosures are returned. Select the recipient-appropriate disclosures
when presenting the credential.

`/v2/keeper/sign` still returns the raw Keeper signature. Compose falls back to that
response for command types without a registered Composer. The SDK exposes
`signature().compose(request)` as JSON and `signature().compose(request, Response.class)`
for typed responses (`PaymentCredential` or `ThresholdSignature`, respectively).
Authority ID and Keeper's artifact type/mode remain authorization metadata; they
are not extra bytes in the protocol signature.

Implemented against the pinned specification snapshots:
[AP2 agent authorization](https://github.com/google-agentic-commerce/AP2/blob/e1ea56db72a6385bce3e5c1112b3a56ce60acb43/docs/ap2/agent_authorization.md)
and [MC VI credential format](https://github.com/agent-intent/verifiable-intent/blob/356c29635f1c44df7de02edb58699ca9f29bece6/spec/credential-format.md).

## Tests

```sh
./gradlew :features:agentic-payments:ap2:test :features:agentic-payments:mc-vi:test :sdk:test
./gradlew dockerBuildIntegration
./gradlew :integration-tests:functional:test --tests '*AgenticPaymentTests'
```
