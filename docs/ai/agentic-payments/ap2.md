# AP2 Authority

Use `type: ap2.mandate` for an AP2 payment mandate. The [tested authority](../../../integration-tests/src/testFixtures/resources/authorities/payments/ap2-purchases.yaml) permits the configured shop and card, at most USD 100 per purchase and USD 150 across the request:

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

`config.mode` defaults to `PAIRED`. For a standalone stage, set it to `PAYMENTS` or `CHECKOUTS`, write the policy for that stage, and use the same mode in the artifact. This example uses `PAIRED`.

```java
var artifact = new Ap2Mandates(PaymentRequestMode.PAIRED, signingInput, disclosures);
var command = Command.of("test:ap2/purchases", artifact);
var result = client.signature().compose(
        Sign.of(p256KeyId, command), PaymentCredential.class);
String credential = result.credential();
```

`signingInput` contains the AP2 protected header and payload encoded as an unsigned JWS; `disclosures` contains every referenced SD-JWT disclosure. The result is the signed credential layer. AP2 supports trusted-provider SD-JWT and delegated KB-SD-JWT; for a delegated credential, present the parent credential bound by `sd_hash`. See the [shared signing contract](README.md) and [module contract](../../../features/agentic-payments/README.md).
