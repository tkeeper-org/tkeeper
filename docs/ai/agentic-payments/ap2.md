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
            not request.allAmountsKnown or purchases.map(p -> p.payment.payment_amount.amount).sum() > maxPerRequest
        }
        allow "office-purchase" when {
            action.kind == "purchase"
            checkout.content.merchant.website == merchants.officeShop.website
            payment.payee.website == merchants.officeShop.website
            payment.payment_instrument.id == methods.companyCard.id
            payment.payment_instrument.type == methods.companyCard.type
            payment.payment_amount.currency == "USD"
            payment.payment_amount.amount <= maxPerPurchase
        }
    }
}
```

The artifact supplies `mode`, unsigned JWS `signingInput` and the referenced SD-JWT `disclosures`. Use the mode selected by the authority config; the default is `PAIRED`. `PAYMENTS` and `CHECKOUTS` expose the corresponding standalone actions, so write rules for their action kind and available data.

In paired mode, `payment`, `checkout` and `action` describe the current purchase. `purchases` contains the whole request; `request.allAmountsKnown` lets the policy reject an uncomputable total. Every action must pass, and any deny wins. Check both per-purchase and aggregate limits to prevent splitting an over-limit request.

Keeper verifies the configured checkout signatures and credential bindings. The composer returns a signed credential layer; it does not execute, capture or settle a payment. For signing inputs, disclosure rules and delegated credentials, see the [payment signing contract](README.md) and [module reference](../../../features/agentic-payments/README.md). See [Edict](../../signing-and-authorities/edict.md) for language syntax.
