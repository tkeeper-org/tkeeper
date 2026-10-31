# Types and input schemas

The schema defines which values a policy can read. Keeper validates a custom request against that schema before evaluating any rule. A field that happens to appear in JSON is not available to a policy unless the document declares it.

## Value types

| Type | Accepted value |
| --- | --- |
| `Text` | String, including an empty string |
| `Integer` | Exact signed integer within the numeric limits |
| `Number` | Exact decimal number. Accepts `Integer` values through exact widening |
| `Boolean` | `true` or `false` |
| `List<T>` | Ordered list whose elements all match `T` |
| `Map<Text, T>` | Object whose arbitrary text keys all have values matching `T` |
| `T?` | A value matching `T`, or `null` |
| A declared struct | Object with the declared fields and no additional fields |

`100` has type `Integer`. `100.0` has type `Number`. An `Integer` widens to `Number` when required by an annotation, parameter or mixed expression, including inside lists, maps, and records. Converting a `Number` expression to `Integer` requires `integer(value)`, which rejects a fractional value. `"100"` remains text and `true` remains a Boolean.

At an input boundary, an `Integer` field accepts numeric values that are exactly integral, including JSON `100.0`. Fractions and text are rejected before any policy rule runs. The type itself permits negative values. Declare a protocol range or add a policy condition when the value must be nonnegative. Native integer widths such as `uint256` and `u64` retain their protocol ranges.

A list needs one compatible element type. Mixing `Integer` and `Number` produces `List<Number>`. A record may contain fields of different types.

## Define reusable records with `struct`

```edict
struct Address {
    country: Text
    postalCode: Text?
}

struct Recipient {
    address: Address
    active: Boolean = true
    tags: List<Text> = []
}
```

`Recipient` reuses `Address` rather than repeating its fields. Nested structs, lists and maps are checked recursively. A struct may refer to another struct declared later in the document, but a cycle such as `Node` containing `List<Node>` is rejected.

These are closed records. An undeclared `region` field in an `Address` is invalid, even when no rule reads it. Use a map when the field names are supplied at runtime.

## Bind a type to an input root

For a custom Keeper authority, declare exactly one root named `request`. Its type must be a record or a map. With a reusable root type:

```edict
struct PaymentRequest {
    amount: Number
    recipient: Recipient
}

input request: PaymentRequest
```

The inline form is convenient when the root type is used only once:

```edict
input request {
    amount: Number
    recipient: Recipient
}
```

Both forms expose `request.amount` and `request.recipient` to the rules. The submitted `artifact.typed` is the root object itself:

```json
{"amount":250,"recipient":{"address":{"country":"AE"}}}
```

Keeper builds the command schema from the compiled document. Authors do not also define a Java `InputSchema` or a separate schema catalog for a custom authority. The standalone Edict API can accept other root arrangements. The `request` root is Keeper's contract for `custom` signing.

## Required, optional, and defaulted fields

```edict
input request {
    amount: Number
    note: Text?
    active: Boolean = true
    tags: List<Text> = []
}
```

| Field | If absent | If explicitly `null` |
| --- | --- | --- |
| `amount` | Invalid input | Invalid input |
| `note` | Becomes `null` | Accepted |
| `active` | Uses `true` | Invalid input |
| `tags` | Uses `[]` | Invalid input |

A default applies only when a field is absent. To accept explicit null, declare an optional type. Defaults must be known at compilation and must match the declared type. They can use compatible authority constants.

Defaults prepare the values used for evaluation. They do not modify the JSON being signed. A consumer executing the signed JSON must use the same authority revision and default semantics. See [Typed signing bytes](../signing-and-authorities/arbitrary-and-typed.md#signing-bytes).

## Optional values in expressions

Use equality to test an optional value:

```edict
request.note == null
request.note == "priority"
```

A null guard narrows an immutable value for the expressions that follow it on the same execution path:

```edict
allow when {
    request.amount != null
    request.amount > 0
}
```

Guards also narrow values in `request.amount != null and request.amount > 0` and on the right side of `request.amount == null or request.amount > 0`. Guarded branches inside functions follow these rules too. A guard in one rule does not narrow another rule. Mutable variables and repeated map or list lookups are not narrowed. Bind a lookup to an immutable `let` before checking it.

Optional records follow the same rule: check the record against `null` before accessing its fields.

## Types provided by native intents

Native intents register simple type names for their input objects. Use `Transaction` for the current transaction, `Certificate` for X.509, or `Request`, `Payment`, `Checkout` and `Context` for payment inputs. The selected intent determines the fields. An EVM `Transaction` has a different schema from a Solana `Transaction`.

```edict
fn acceptableGas(tx: Transaction): Boolean {
    return tx.gasLimit <= 150000
}
```

This example requires an EVM intent. Call it inside the policy with `acceptableGas(transaction)`. Omitting the parameter annotation still allows the compiler to infer the type. User-defined structs cannot shadow a type provided by the intent.

## Lists and maps

Use a list when position or repeated values matter:

```edict
input request {
    recipients: List<Recipient>
}
```

Use a map when each value is named by a key supplied at runtime:

```edict
input request {
    recipients: Map<Text, Recipient>
}
```

An input such as `{"recipients":{"invoice-42":{"address":{"country":"AE"}}}}` matches this map type. Each recipient record is still closed. Map keys are always `Text`. Numeric-looking keys such as `"42"` remain text. `Map<Number, T>` and `Map<Boolean, T>` are rejected.

Maps may be nested, such as `Map<Text, Map<Text, Number>>`. Lists and optional values may be map values too. Declaring `input request: Map<Text, Number>` makes the entire submitted JSON object the map.

Read [Functions and collections](functions-and-collections.md#sorted-maps) for ordering, lookup, and iteration.

## Native input schemas

A native intent has inputs supplied by its decoder. Declaring a custom `request` does not replace the EVM transaction, Bitcoin outputs, or X.509 certificate fields. Contract and program declarations expose their decoded methods automatically, using the module's wire types. See [Native transaction policies](native-policies.md).
