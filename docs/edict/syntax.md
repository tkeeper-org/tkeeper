# Document structure and syntax

An Edict authority has one named `authority` block containing declarations and one named `policy` block containing its rules. Braces delimit blocks. Newlines separate statements. Source files use the `.edict` extension.

## Language version and document properties

```edict
language "edict-v1"
authority "service-payment" {
    intent = "custom"
    version = "1"
    title = "Service payment limit"
    description = "Permit one positive payment of at most 100."

    input request { amount: Number }

    policy "payment-limit" {
        allow if (request.amount > 0 and request.amount <= 100)
    }
}
```

The language header, when present, must precede the authority on its own line. Only `edict-v1` is accepted. Omitting the header always selects v1. An unknown version is a compilation error.

Keeper requires `intent` and `version` as text properties. `intent` selects the command format and available native inputs. `version` identifies the document revision. It does not replace the OCI digest. `title` and `description` are optional text for readers.

## Declarations and their scope

| Declaration | Purpose | Where it belongs |
| --- | --- | --- |
| `struct Recipient { ... }` | Reusable input record type | Authority |
| `input request { ... }` or `input request: Request` | An input root and its type | Authority |
| `let maximum = 100` | Immutable named value | Authority, policy, or function |
| `fn permitted(amount: Number) { ... }` | Reusable computation | Authority |
| `approver reviewer { ... }` | An eligible approver | Authority |
| `config { chainId = 1 }` | Settings required by a native intent | Authority |
| `contract token: evm { ... }` | Native contract interface | Authority |
| `program system: solana { ... }` | Native program interface | Authority |
| `allow`, `deny`, `require`, `default` | Decision and approval rules | Policy |
| `var`, assignment, `if`, `for`, `return` | Function-local computation | Function body |

Use authority-level `let` for shared constants. Use policy-level `let` for values derived from that action's inputs. Functions take the data they need as parameters. Inputs, records, lists, and maps remain immutable.

## Names

Names are case-sensitive. Identifiers use ASCII letters, digits, and the `_` character, begin with a letter or `_`, and contain no spaces. `recipient` and `Recipient` are different names. Authority ids, policy ids and rule labels are quoted strings.

A field whose name is a keyword can use backticks in its declaration and access:

```edict
input request {
    `approver`: Text
}
```

Read it as ``request.`approver` ``. Backticks escape field names that follow the identifier syntax. Use a map and bracket lookup for arbitrary text keys such as `"invoice-42"`.

## Literals and records

| Value | Source example |
| --- | --- |
| Text | `"USD"` |
| Integer | `100`, `-10` |
| Number | `100.0`, `0.25` |
| Boolean | `true`, `false` |
| Absent value | `null` |
| List | `["USD", "EUR"]` |
| Record | `{country = "AE", active = true}` |
| Record with a text key | `{"invoice-42" = 250}` |
| Empty record or map value | `{}` |

Source number literals are decimal digits with an optional fractional part. Write `0.5`, not `.5`. Source literals do not use exponent notation, hexadecimal notation, or digit separators. JSON requests may still contain exponent-form numbers.

Strings use double quotes. Escapes include `\"`, `\\`, `\n`, `\r`, `\t` and `\uXXXX`. A newline inside a string must be escaped. Text comparisons are case-sensitive.

Use `:` to declare a field's type and `=` to assign a value or a default:

```edict
struct Recipient {
    country: Text
    active: Boolean = true
}

let recipient = {country = "AE", active = true}
```

## Lines, comments, and formatting

Statements have no semicolons. Start a new declaration or rule on a new line. A `//` comment runs to the end of the line. Block comments are not supported.

```edict
let allowedCountries = [
    "AE",
    "GB"
]

// Give the total its own name when several rules need it.
let maximumTotal = 1000
```

Lists and call arguments can span lines within their brackets or parentheses. Use parentheses around a multiline Boolean expression after `if`, or use a `when` block with one condition per line. The [expressions guide](expressions.md) explains evaluation order and short circuit behavior.

Continue with [Types and input schemas](types-and-inputs.md).
