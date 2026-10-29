# Your first policy

This authority permits one payment in USD to a recipient in the UAE. The amount must be positive and no greater than 1,000. A missing required field or a value of the wrong type prevents the request from reaching the rules.

```edict
language "edict-v1"
authority "payment-limits" {
    intent = "custom"
    version = "1"

    struct Recipient {
        country: Text
        active: Boolean = true
    }

    input request {
        amount: Number
        currency: Text
        recipient: Recipient
        note: Text?
    }

    policy "payment-limits" {
        allow "permitted-payment" when {
            request.amount > 0
            request.amount <= 1000
            request.currency == "USD"
            request.recipient.country == "AE"
            request.recipient.active
        }
    }
}
```

Save the UTF-8 source as `authority.edict`. The document declares the shape of a command; it does not make a transfer itself.

## Read the document

`language "edict-v1"` selects the language version. It can be omitted; an omitted header means v1. The `version = "1"` field is the authority's document revision and is separate from the language version.

`authority "payment-limits"` names the authority. Use this same id when attaching the OCI artifact to a key and when selecting it in a signing command. `intent = "custom"` tells Keeper that the artifact contains application JSON.

`struct Recipient` defines a reusable record. `country` is required text; `active` is a Boolean with a default. `input request` declares the root object the rules will read. `note: Text?` permits a string or `null`, and an absent note becomes `null`.

`policy "payment-limits"` contains the rules. `allow` permits the action when its condition is true. Each line in `when` must be true. The optional label `"permitted-payment"` identifies a matched rule in decision results. No matching allow means deny.

## Send the matching input

The value supplied in `artifact.typed` is:

```json
{
  "amount": 250,
  "currency": "USD",
  "recipient": {
    "country": "AE"
  }
}
```

There is no extra `request` wrapper in the API payload. Keeper binds `artifact.typed` to `request` during evaluation. It supplies `active = true` and `note = null` for this document.

A signing command using that object has this shape:

```json
{
  "type": "custom",
  "authorityId": "payment-limits",
  "artifact": {
    "scheme": "ECDSA",
    "hash": "SHA256",
    "typed": {
      "amount": 250,
      "currency": "USD",
      "recipient": {"country": "AE"}
    }
  }
}
```

The scheme must be supported by the selected key. [Signing](../signing-and-authorities/signing.md) describes the enclosing request, including `keyId`.

## Check the outcomes

| Change to the input | Result |
| --- | --- |
| Submit the object above | Allow |
| Set `amount` to `1000` | Allow |
| Set `amount` to `1000.01`, `0` or a negative number | Deny |
| Set `currency` to `EUR` or `country` to `GB` | Deny |
| Set `active` to `false` | Deny |
| Send `"250"` as the amount | Invalid input: text is not a number |
| Omit `recipient` or add an undeclared field to it | Invalid input: the record does not match its schema |

An invalid input is an error, distinct from a valid input denied by a rule. Neither produces a signature.

## Use the same meaning when executing the command

Keeper signs the submitted JSON. Defaults apply to policy evaluation and are not inserted into the signed payload. A service executing this command must verify the signature, identify the expected authority revision and apply the same default semantics.

The policy checks the supplied `country` and `active` values. Those fields do not prove the recipient's identity or status. The application must establish their origin, or redesign the command so it can verify the relevant facts itself. See [Typed JSON signing](../signing-and-authorities/arbitrary-and-typed.md#signing-bytes).

Continue with [Document structure and syntax](syntax.md) or [Types and input schemas](types-and-inputs.md).
