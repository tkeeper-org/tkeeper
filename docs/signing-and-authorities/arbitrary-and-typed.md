# Arbitrary and Typed Authorities

## `arbitrary`

`arbitrary` is raw signing. TKeeper checks that the key identity allows `arbitrary`, then signs the bytes from the command.
It is disabled by default and requires `keeper.authority.arbitrary.enabled = true` on every keeper
in the cluster.

Use it for:

- local demos
- compatibility with systems that already govern the payload elsewhere
- narrow raw-signing cases accepted by policy and security review

Do not use it when TKeeper is expected to understand the business effect. Raw bytes do not tell TKeeper whether the action moves funds, changes production, issues a certificate, or approves a tool call.

## `custom`

`custom` is for typed JSON commands. The authority document defines the expected command shape and the effects exposed to policy.

Start with the [typed authority example and matching command](authorities.md#custom-authority-example). It shows the field shapes and each CEL helper category in context.

Use it for:

- AI-agent tool or action intents
- internal service commands
- business-specific approvals
- workflows where a backend verifies TKeeper proof before execution

Only declared fields are available to policy. The executing backend must not derive additional effects from undeclared fields in the submitted JSON.

## Typed JSON signing material

For a `custom` command, TKeeper signs the submitted `artifact.typed` JSON object. It does not sign
the authority document, the materialized CEL intent, or the generated `effects` object.

TKeeper converts `artifact.typed` into signing material as follows:

1. Sort every JSON object's field names lexicographically.
2. Apply the same rule recursively to nested objects, including objects inside arrays.
3. Preserve array element order.
4. Preserve scalar JSON values and types, including strings, booleans, numbers, and explicit
   `null` values.
5. Serialize the resulting tree as compact UTF-8 JSON with no insignificant whitespace.
6. Apply the command artifact's `hash` method to those bytes. `NONE` leaves the bytes unchanged;
   `SHA256`, `SHA512`, and `KECCAK256` produce the corresponding digest.
7. Pass that byte sequence to the selected signature scheme.

In compact notation:

```text
canonical = UTF-8(compact-json(sort-object-fields-recursively(artifact.typed)))
signingMaterial = hash.process(canonical)
signature = scheme.sign(signingMaterial)
```

For example, this submitted object:

```json
{
  "sequence": 7,
  "deployment": {
    "version": "2.4.1",
    "environment": "production"
  },
  "roles": [
    { "name": "operator", "priority": 1 },
    { "priority": 2, "name": "auditor" }
  ]
}
```

is serialized for signing as:

```json
{"deployment":{"environment":"production","version":"2.4.1"},"roles":[{"name":"operator","priority":1},{"name":"auditor","priority":2}],"sequence":7}
```

With `hash: SHA256`, the expected signing material is:

```text
a55960ff8a2b7af9338df51db5074e4bf5cd012dafe07cb113bda0d6642c72e1
```

Object field order and insignificant input whitespace therefore do not change the signing
material. Array order does. Missing fields remain missing, while an explicitly submitted `null`
remains present. Authority defaults may affect the materialized policy intent, but they are not
inserted into the submitted JSON before signing.

### Relationship to RFC 8785/JCS

This encoding is TKeeper-specific and is not
[RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785).

Both encodings remove insignificant whitespace, recursively sort object names by their UTF-16
code-unit values, preserve array order, emit UTF-8, and preserve Unicode strings without applying
Unicode normalization. Their primitive-value contracts differ:

- JCS restricts input to I-JSON, represents JSON numbers as IEEE-754 double-precision values, and
  uses ECMAScript's exact primitive serialization rules.
- TKeeper canonicalizes a parsed Jackson `JsonNode` tree and uses Jackson's compact serialization.
  It serializes the numeric node type and value produced by Jackson instead of applying JCS's
  required ECMAScript number-normalization algorithm. Integral values may use arbitrary-precision
  nodes; floating-point representation depends on the parsed node type.
- JCS defines validation requirements for duplicate object names and invalid Unicode. TKeeper's
  canonicalizer receives an already-parsed object tree, so parsing has already resolved the input
  token stream before canonicalization.

A generic JCS implementation is therefore not a compatible replacement for TKeeper's encoder.
Producers and verifiers should use the SDK command types and must not independently rewrite numeric
values or representations before verification.

The outer `keyId`, `authorityId`, command `type`, `scheme`, `hash`, generation, policy decision, and
effects are not concatenated into the JSON message. They select the key, authorization path, and
cryptographic processing. Verification must use the same typed payload, scheme, hash method, key,
generation, and tweak context that the integration expects.

## Custom authority config

```yaml
type: custom
config:
  fields:
    amount:
      type: bigint
    currency:
      type: string
    customer:
      type: object
      fields:
        id:
          type: string
        country:
          type: string
          required: false
          default: UNKNOWN
  effects:
    - type: payment.transfer
      fields:
        asset: "$currency"
        amount: "$amount"
        customerId: "$customer.id"
```

Field rules:

- JSON root must be an object
- unknown fields are rejected before policy evaluation
- `effects` is reserved
- `required` defaults to `true`
- `nullable` defaults to `false`
- optional missing fields without a default become CEL `null`
- config typos and invalid defaults reject the authority

Supported types:

| Type | CEL/runtime value |
| --- | --- |
| `string` | string |
| `bool` | boolean |
| `int` | signed 32-bit integer |
| `bigint` | arbitrary-precision integer |
| `decimal` | arbitrary-precision decimal |
| `time` | instant |
| `bytes` | bytes decoded from Base64 |
| `object` | nested object with declared `fields` |
| `list` | list whose element schema is declared in `items` |

`bigint` requires an integral JSON number and `decimal` requires a JSON number. Preserve large values when constructing JSON; do not pass them through an IEEE-754 `double`. `bytes` accepts Base64 strings. `time` accepts ISO-8601 instant strings such as `2030-01-02T03:04:05Z`.

Effect mapping strings beginning with `$` resolve declared field paths. `$$value` produces the literal string `$value`.

The declared fields and `effects` become strict CEL roots. See [Authorities](authorities.md#strict-cel-roots) and [CEL Functions](cel-functions.md).

## Decision rule

| Need | Use |
| --- | --- |
| Sign bytes with no semantic policy in TKeeper | `arbitrary` |
| Govern a typed business action | `custom` |
| Govern an EVM transaction | `evm.transaction` |
| Govern a Bitcoin transaction | `bitcoin.transaction` |
| Govern a Tron, XRP, or Solana transaction | `tron.transaction`, `xrp.transaction`, or `solana.transaction` |
| Govern an AP2 or MC VI mandate | `ap2.mandate` or `mcintent.mandate` |
| Govern certificate issuance | `x509.tbs-certificate` |

`arbitrary` cannot be mixed with concrete authorities on the same key identity.

Do not describe an `arbitrary` integration as governed intent unless another trusted layer defines, validates, and binds the meaning of the signed bytes.
