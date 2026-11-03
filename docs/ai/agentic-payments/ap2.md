# AP2 policies

The document pins merchant and payment-method catalogs and checks each purchase. Amounts below are integer minor units: `10000` is USD 100 and `15000` is USD 150.

```edict
authority "test:ap2/purchases" {
    intent = "ap2.mandate"
    version = "2.0.0"

    config {
        merchants = {
            officeShop = {
                website = "https://office.example"
            }
        }
        methods = {
            companyCard = {
                id = "card-1"
                type = "card"
            }
        }
    }

    policy "office-purchases" {
        let maxPerPurchase = 10000
        let maxPerRequest = 15000
        deny "request-total" when {
            not request.allAmountsKnown or purchases.map(p -> p.payment.amount).sum() > maxPerRequest
        }
        allow "office-purchase" when {
            action.kind == "purchase"
            checkout.content.merchant.website == merchants.officeShop.website
            payment.payee.website == merchants.officeShop.website
            payment.instrument.id == methods.companyCard.id
            payment.instrument.type == methods.companyCard.type
            payment.currency == "USD"
            payment.amount <= maxPerPurchase
        }
    }
}
```

The artifact supplies `mode`, unsigned JWS `signingInput` and the referenced SD-JWT `disclosures`. Use the mode selected by the authority config. The default is `PAIRED`. `PAYMENTS` and `CHECKOUTS` expose the corresponding standalone actions, so write rules for their action kind and available data.

Use `payment.amount` for the amount in minor units, `payment.currency` for its currency code, and `payment.instrument` for the payment instrument. Each entry in `purchases` exposes the same fields on its `payment`.

In paired mode, `payment`, `checkout` and `action` describe the current purchase. `purchases` contains the whole request. `request.allAmountsKnown` lets the policy reject a total with unknown amounts. Signing requires every action to pass. A deny result rejects the request. Check both per-purchase and aggregate limits to prevent splitting an over-limit request.

Keeper verifies the configured checkout signatures and credential bindings. The composer returns a signed credential layer. It does not execute, capture, or settle a payment. For signing inputs, disclosure rules and delegated credentials, see the [payment signing contract](README.md) and [module reference](../../../features/agentic-payments/README.md). See [Edict](../../signing-and-authorities/edict.md) for language syntax.
