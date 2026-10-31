# Expressions and numbers

Expressions compute values. A rule's condition must produce `Boolean`. A number or text value is never treated as true merely because it is nonzero or nonempty.

## Boolean conditions

Use `and`, `or` and `not`:

```edict
request.amount > 0 and request.amount <= 1000
request.currency == "USD" or request.currency == "EUR"
not request.recipient.active
```

`and` stops at the first false operand. `or` stops at the first true operand. The skipped operand is not evaluated, so a guard can protect a list index or map lookup.

`when` is a Boolean expression joining its lines with `and`:

```edict
allow "usd-payment" when {
    request.currency == "USD"
    request.amount > 0
    request.amount <= 1000
}
```

The lines run from top to bottom and stop at the first false result. An empty `when` is invalid. Use `or` explicitly when alternatives are intended.

## Comparison and membership

| Operation | Meaning |
| --- | --- |
| `a == b`, `a != b` | Equality or inequality between compatible values |
| `a < b`, `a <= b`, `a > b`, `a >= b` | Numeric comparison |
| `value in items`, `value not in items` | Membership in a compatible list |
| `"USD" in limits` | Existence of a text key in a map |

Text equality is case-sensitive. There are no text ordering operators or implicit text-to-number conversions. Numeric equality compares value, so `1 == 1.0` is true. Lists compare their elements in order. Records and maps compare their fields and values.

Membership in a map checks the key. It returns true even when that key's value is explicitly `null`. In a list, membership tests compare values.

## Exact arithmetic

`Integer` stores whole numbers using arbitrary-precision integer arithmetic. `Number` stores exact decimals. The ordinary operators preserve precision within the configured size limits:

```edict
0.1 + 0.2 == 0.3
request.amount * 100
(request.amount + request.fee) <= maximum
```

`+`, `-` and `*` return `Integer` when both operands are `Integer`. If either operand is `Number`, the result is `Number`: `5 * 2` is the integer `10`, while `5 * 2.5` is the decimal `12.5`. Unary `+` and `-` preserve the operand's type.

`/` always returns `Number` and requires an exact result: `10 / 4` produces `2.5`, while `1 / 3` fails because its decimal expansion has infinitely many digits. `6 / 2` is a `Number` with value `3`. Use `integer(6 / 2)` when an `Integer` result is required. Dividing by zero fails. Intermediate results are bounded too. A later subtraction does not make an oversized intermediate multiplication acceptable.

`%` returns an `Integer` remainder. Both operands must have integral values. Decimal fractions are rejected. A negative remainder follows the dividend's sign, so `-5 % 2` is `-1`.

`integer(value)` converts either numeric type to `Integer` without rounding. `integer(5.0)` returns `5`. `integer(2.5)` fails. To round a division result, use `divide` with an explicit scale and rounding mode before converting it.

Use the units defined by the intent. A token's on-chain integer amount does not become a human decimal amount automatically. A six-decimal token represents 100 tokens as `100000000`. The native intent guides state their units.

## Rounding explicitly

Use `divide` when the policy calls for a rounded result:

```edict
divide(10, 3, 2, "HALF_UP") == 3.33
```

The arguments are dividend, divisor, decimal scale, and rounding mode. Scale must be a nonnegative integer within the engine's limit. A scale of 2 sets the result to two digits after the decimal point. Digits before the decimal point do not count toward that scale.

| Mode | Rule |
| --- | --- |
| `UP` | Round away from zero |
| `DOWN` | Round toward zero |
| `CEILING` | Round toward positive infinity |
| `FLOOR` | Round toward negative infinity |
| `HALF_UP` | Round to nearest. A tie goes away from zero |
| `HALF_DOWN` | Round to nearest. A tie goes toward zero |
| `HALF_EVEN` | Round to nearest. A tie chooses an even final digit |
| `UNNECESSARY` | Require an exact result at the selected scale |

Choose the mode required by the business rule. The rounding mode is a case-sensitive text value. Rounding does not bypass the number-size or execution limits.

## Precedence

From highest to lowest precedence:

1. Field access, calls, and indexing.
2. Unary `not`, `-` and `+`.
3. `*`, `/` and `%`.
4. `+` and `-`.
5. Comparisons and membership.
6. `and`.
7. `or`.

Use parentheses when the grouping matters to a reader. Write `0 < amount and amount <= 100`. Chained comparisons such as `0 < amount <= 100` are unsupported.

## Guard an operation where it executes

For a map with nonoptional numeric values:

```edict
allow if ("USD" in request.limits and request.limits["USD"] <= 1000)
```

The lookup runs only when the key exists. For a list, `items.count() > 0 and items[0] == expected` protects access to the first item.

Policy-level `let` bindings are evaluated before the rule conditions. This version would perform the lookup too early:

```edict
let usd = request.limits["USD"]
allow if ("USD" in request.limits and usd <= 1000)
```

Keep a potentially failing operation inside its guarded expression or inside an `if` branch in a function. A matching allow does not stop later rules from being evaluated. [Decision rules](decisions-and-approvals.md) are not a sequence of early returns.

Continue with [Functions and collections](functions-and-collections.md).
