# Functions and collections

Use functions to name a check or calculation that the policy repeats. Use collection operations to apply that check to every item, count matches or calculate a total.

## Immutable bindings

`let` names a value and cannot be reassigned. An authority-level binding holds a constant. A policy-level binding may read the request:

```edict
let maximum = 1000

policy "payment-limit" {
    let total = request.payments.values().sum(payment -> payment.amount)
    allow if (total > 0 and total <= maximum)
}
```

A binding evaluates where it is declared. A later rule cannot guard a failing lookup in an earlier binding. Put a potentially absent map lookup inside a guarded expression, as described in [Expressions](expressions.md#guard-an-operation-where-it-executes).

## Declare a function

```edict
fn permittedCountry(country: Text): Boolean {
    return country in ["AE", "GB"]
}
```

Call it with `permittedCountry(request.recipient.country)`. Arguments and return values are checked at compilation. Parameter and result annotations can be omitted when usage provides enough information. An unused function needs parameter annotations so the compiler can check its body.

Functions use explicit `return`. Every possible path must return a compatible value. Functions cannot recurse or call arbitrary Java methods. Pass request data as parameters; functions do not obtain it through an implicit request context.

## Lists and lambdas

A lambda has one parameter followed by `->` and an expression:

```edict
request.payments.all(payment -> payment.amount > 0)
```

The parameter's type comes from the list. A lambda can read immutable surrounding values, but cannot capture a mutable `var`.

| Expression | Result |
| --- | --- |
| `items.count()` | `Integer` count of items |
| `items.count(item -> condition)` | `Integer` count satisfying the condition |
| `items.filter(item -> condition)` | List of matching items, preserving their order |
| `items.map(item -> expression)` | List of calculated values in the same order |
| `items.any(item -> condition)` | Whether at least one item matches |
| `items.all(item -> condition)` | Whether every item matches |
| `numbers.sum()` | Sum of a numeric list |
| `items.sum(item -> numericExpression)` | Sum of calculated numeric values |

On an empty list, `all` returns true, `any` returns false, and `count` and `sum` return zero. Require `items.count() > 0` when an empty action is invalid. `any` and `all` stop once the result is known.

`sum` returns `Integer` for integer elements or selector results, and `Number` for decimal ones. This also determines the type of zero for a typed empty list. An untyped `[].sum()` returns the integer zero.

List indexes start at zero. `items[0]` reads the first item. Negative, fractional and out-of-bounds indexes fail evaluation. A typed empty list such as `let amounts: List<Number> = []` supplies the element type when there is no value from which to infer it.

## Sorted maps

Declare a map as `Map<Text, T>`. Keys are always text, including numeric-looking keys such as `"42"`. A record literal supplies its initial values:

```edict
let limits: Map<Text, Number> = {USD = 1000, EUR = 500}
```

Maps are immutable and sort their keys in case-sensitive UTF-16 order. Ordering is independent of insertion order and locale: uppercase `A` comes before lowercase `a`. Text is not normalized; different Unicode spellings remain different keys.

| Expression | Result |
| --- | --- |
| `limits["USD"]` | Value for `USD`; fails when absent |
| `"USD" in limits` | Whether the key exists |
| `"USD" not in limits` | Whether the key is absent |
| `limits.count()` | `Integer` count of entries |
| `limits.keys()` | Keys in sorted order |
| `limits.values()` | Values in that same key order |
| `limits.entries()` | Records with `key` and `value`, in key order |

An existing key with a null value is still present. `Map<Text, Number?>` permits such values; `Map<Text, Number>` does not. Map operations take no arguments. Use `values()` or `entries()` to obtain a list before applying a lambda.

```edict
request.payments.entries().all(entry -> entry.value.amount > 0)
request.payments.values().sum(payment -> payment.amount)
```

Use bracket lookup for dynamic keys. `limits.USD` is record-field access and is not supported on a map. Keys may be empty strings; constrain the allowed keys in your policy when the application needs a narrower naming rule.

## Local variables and loops

Use a local `var` and `for` when the calculation needs several steps per item:

```edict
fn total(payments: Map<Text, Number>): Number {
    var result: Number = 0
    for (entry in payments.entries()) {
        result += entry.value
    }
    return result
}
```

`var` may be reassigned with `=`, `+=` or `-=` inside a function. Assignment must preserve its type. It does not make a list, map or input mutable. A `for` loop iterates a finite list; use `map.entries()` to visit map entries. There is no `while` loop.

`var result = 0` infers `Integer`. Use `var result: Number = 0` for an accumulator that receives decimal values; an inferred integer variable cannot be widened by a later assignment.

Use `if (...) { ... } else { ... }` for conditional steps. A return exits the function. Loops, lambdas and function calls share the request's execution budget.

## Complete map policy

This document accepts a nonempty map of positive invoice amounts whose total is at most 1,000:

```edict
authority "invoice-limits" {
    intent = "custom"
    version = "1"

    input request: Map<Text, Number>

    fn total(amounts: Map<Text, Number>): Number {
        return amounts.values().sum()
    }

    policy "invoice-limits" {
        allow when {
            request.count() > 0
            request.values().all(amount -> amount > 0)
            total(request) <= 1000
        }
    }
}
```

The matching `artifact.typed` can be `{"invoice-42":250,"invoice-43":100}`. Reordering those fields changes neither the total nor the decision. Adding an amount as a string fails input validation.

Next: [Decisions and approvals](decisions-and-approvals.md).
