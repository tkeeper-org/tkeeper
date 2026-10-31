# Errors and execution limits

Distinguish a policy denial from invalid input or a calculation error when diagnosing a signing failure. Keeper rejects requests in each of these cases.

## Compilation errors

Keeper checks an authority before attaching it to a key. Errors include invalid syntax, unknown names or types, incompatible expressions, duplicate fields, recursive structs or functions, invalid defaults, and unsupported declarations.

Examples:

| Source problem | Correction |
| --- | --- |
| A `Number` field compared with `"100"` | Use a number literal or change the declared type |
| `Map<Number, Number>` | Use `Map<Text, Number>` and text keys |
| Access to an undeclared record field | Declare the field or correct its name |
| A struct containing itself through a list or map | Use a finite, nonrecursive shape |
| `amount: Number = "zero"` | Use a numeric default |
| A custom authority with two input roots | Declare one object root named `request` |

Correct the source and publish a new OCI artifact, then update the reference trusted by the key.

## Input validation errors

Validation checks the compiled schema recursively for map values and list items. Missing required fields and extra fields in closed records fail validation. So do text in numeric fields and values outside their bounds.

Native decoders reject malformed bytes or a mismatched network. Calls must be declared, and authorization must use a supported form. The [intent guide](native-policies.md) states the accepted format and restrictions. Replacing the input with a permissive schema does not repair invalid native bytes.

## Evaluation errors

Some operations are valid to compile but can fail for a request:

| Operation | Failure |
| --- | --- |
| `limits["USD"]` | Key absent |
| `items[0]` | List empty |
| `amount / count` | Zero divisor or nonterminating decimal result |
| Fractional operands for `%` | Integer remainder requires integral values |
| Large arithmetic or collection expansion | Numeric or resource budget exceeded |

Guard absent keys and indexes at the expression where they are used. Choose an explicit rounding mode for nonexact division. Do not assume a later allow, deny, or fallback catches an evaluation error.

## Bounded execution

The engine bounds source length, tokens, nesting, text size, numeric precision and scale, value count, and execution work. Input preparation, defaults, arithmetic, comparisons, collection operations, loops, and function calls consume budgets. Collection projections allocate values too: `entries()` constructs a list of entry records, so its cost is greater than `count()`.

Limits apply to intermediate results, not just the final Boolean. A policy can exceed a budget even if its input is syntactically valid. The standalone Java API configures limits. A Keeper policy cannot increase them through source declarations.

Use the operation that expresses the question directly. `items.any(...)` can stop at the first match. Building a filtered list merely to check whether one match exists does more work. Keep permitted request sizes within the app's expected range and test their upper boundary.

## Check a policy before use

Exercise an allowed request, a denied request, and malformed inputs. Include exact boundaries, empty collections, unexpected fields, and extra native operations. For approvals, check that other allow rules do not remove matching approval requirements.

Keeper's [dry run](../signing-and-authorities/dry-run.md) previews decisions for an attached authority. A dry run does not reserve authorization or guarantee that a later request has the same key, context, or expiry. Approval proofs and the actual signing request still undergo their normal checks.

Return to the [language guide](README.md) or continue with [OCI authorities](../signing-and-authorities/authorities.md).
