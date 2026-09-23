# Agentic Payment Authorities

AP2 uses `ap2.mandate`; Mastercard Verifiable Intent uses `mcintent.mandate`. Both sign an ES256 JWS input with a P-256 key. Build with `-Pkeeper.features=agentic-payments -Pkeeper.platforms=ecc`, or select `ap2` or `mc-vi` alone.

## Authority example

This [AP2 authority](../../integration-tests/src/testFixtures/resources/authorities/payments/ap2-purchases.yaml) allows the configured shop and card, at most USD 100 per purchase and USD 150 across the request:

```yaml
schemaVersion: verdict.authority/v1
id: test:ap2/purchases
type: ap2.mandate
version: 2.0.0
config:
  merchants:
    officeShop:
      website: https://office.example
  methods:
    companyCard:
      id: card-1
      type: card
policy:
  id: office-purchases
  fallback: DENY
  variables:
    maxPerPurchase: "100.00"
    maxPerRequest: "150.00"
  allow:
    - id: office-purchase
      where:
        - "action.kind == 'purchase'"
        - "checkout.merchantIs(merchants.officeShop)"
        - "payment.payeeIs(merchants.officeShop)"
        - "payment.methodIs(methods.companyCard)"
        - "payment.amountAtMost(maxPerPurchase, 'USD')"
  deny:
    - id: request-total
      where:
        - "!request.totalAtMost(maxPerRequest, 'USD')"
```

The [MC VI authority](../../integration-tests/src/testFixtures/resources/authorities/payments/mcintent-purchases.yaml) uses the same limits with `type: mcintent.mandate`. `config.mode` defaults to `PAIRED`; use `PAYMENTS` or `CHECKOUTS` for a standalone stage. The artifact mode must match.

## Compose a credential

`signingInput` is the exact unpadded base64url JWS header and payload joined by `.`. Supply every disclosure referenced by the mandate. TKeeper checks their commitments, evaluates policy, signs the unchanged input, and returns a credential layer:

```java
var artifact = new Ap2Mandates(PaymentRequestMode.PAIRED, signingInput, disclosures);
var command = Command.of("test:ap2/purchases", artifact);
var result = client.signature().compose(
        Sign.of(p256KeyId, command), PaymentCredential.class);
String credential = result.credential();
```

For MC VI, use `new McMandates(mode, signingInput, disclosures)` and the MC VI authority ID. `/v2/keeper/sign` returns only the raw signature; [Composer](composer.md) returns the serialized credential.

The caller supplies issuer, audience, nonce, time, and parent-binding claims. The recipient verifies the credential chain, merchant identity, audience, expiry, and replay rules. Keeper checks the outgoing layer's content commitments; it does not authenticate parent credentials or the merchant's signature. See the [module contract](../../features/agentic-payments/README.md) for supported AP2 and MC VI profiles and disclosure rules.
