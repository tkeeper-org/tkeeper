# Raw and typed JSON signing

## Raw signing

`arbitrary` signs raw bytes after key access checks. Enable it with `keeper.authority.arbitrary.enabled = true` and attach it as the key's only authority. It does not check semantic policy for those bytes.

## Typed JSON

Use `custom` for an app command described by JSON. Its Edict document declares exactly one object input, `request`. The object may be a closed record or `Map<Text, T>`. Define reusable shapes with `struct`. Declare defaults and optional fields in the document.

```edict
authority "test:custom/recipients" {
    intent = "custom"
    version = "1.0.0"
    title = "Payments to approved recipient countries"

    struct Address {
        country: Text
        note: Text?
    }

    struct Recipient {
        address: Address
        labels: List<Text> = []
    }

    struct PaymentRequest {
        amount: Number
        recipients: List<Recipient>
        status: Text = "READY"
    }

    input request: PaymentRequest

    policy "approved-recipients" {
        allow when {
            request.amount > 0
            request.amount <= 100
            request.status == "READY"
            request.recipients.count() > 0
            request.recipients.all(recipient -> recipient.address.country == "AE")
        }
    }
}
```

Submit `artifact.typed` without an extra `request` wrapper:

```java
var typed = TKeeperJackson.signingNode().put("amount", 10);
typed.putArray("recipients").addObject().putObject("address").put("country", "AE");
var artifact = new TypedData(SignatureSchemes.ECDSA, HashMethod.SHA256, typed);
var command = Command.of("test:custom/recipients", artifact);
var signature = client.signature().sign(Sign.of(keyId, command));
```

A missing `status` uses `READY`. A missing `labels` uses `[]`. A missing `note` becomes `null`. Unknown fields in a record, missing required fields, and wrong types fail validation. Maps accept text keys supplied at runtime and validate each value. Numeric strings are not coerced to numbers. Decimal and large integer values retain their exact value through parsing and peer transport. The control-plane command schema is generated from the compiled Edict input.

## Signing bytes

Keeper signs the submitted `artifact.typed` object, without adding schema defaults to it:

1. Sort every object's field names lexicographically, recursively, including objects in arrays.
2. Preserve array order and scalar JSON types and values, including explicit `null`.
3. Serialize compact UTF-8 JSON.
4. Apply the artifact's `hash`: `NONE`, `SHA256`, `SHA512` or `KECCAK256`.
5. Pass the result to the selected signature scheme.

Use `TKeeperJackson.signingBytes` when constructing the same bytes in a Java consumer. This is Keeper's signing format. It is not a claim of conformance to another JSON canonicalization standard.

Decimal scale is preserved: `1.2300` and `1.23` evaluate as equal numbers but produce different signing bytes. Floating-point nodes use their decimal text representation, so the SDK and Keeper serialize scientific notation consistently. Use `BigDecimal` when constructing exact amounts.

The executing service must verify the signature and authority identity. It must execute the declared command using the same document revision and defaults. A signature over JSON does not establish whether user-supplied assertions are true. Bind external approvals or attestations to this command and check their origin in the app.

See [Edict](edict.md) for language syntax and [Authorities](authorities.md) for OCI publication.
