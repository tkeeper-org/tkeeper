# MC Intent Authority

Use `type: mcintent.mandate` for a Mastercard Verifiable Intent mandate. The [tested authority](../../../integration-tests/src/testFixtures/resources/authorities/payments/mcintent-purchases.yaml) permits the configured shop and card, at most USD 100 per purchase and USD 150 across the request:

```yaml
schemaVersion: verdict.authority/v1
id: test:mcintent/purchases
type: mcintent.mandate
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

`config.mode` defaults to `PAIRED`. For a terminal L3 stage, set it to `PAYMENTS` or `CHECKOUTS`, write the policy for that stage, and use the same mode in the artifact. This example uses `PAIRED`.

```java
var artifact = new McMandates(PaymentRequestMode.PAIRED, signingInput, disclosures);
var command = Command.of("test:mcintent/purchases", artifact);
var result = client.signature().compose(
        Sign.of(p256KeyId, command), PaymentCredential.class);
String credential = result.credential();
```

`signingInput` contains the MC VI protected header and payload encoded as an unsigned JWS; `disclosures` contains every referenced SD-JWT disclosure. The result is the signed credential layer. MC VI supports L2 Immediate and Autonomous credentials and terminal L3 credentials. The protected header's `typ` identifies the profile; L3 requires `kid` and a validity interval of at most one hour. See the [shared signing contract](README.md) and [module contract](../../../features/agentic-payments/README.md).
