# Decisions and approvals

A policy decides whether an action is allowed and which approvals it needs. Its rules are evaluated together. Their order does not make the first matching rule the final decision.

## Allow and deny

```edict
allow "small-payment" if (request.amount > 0 and request.amount <= 1000)
deny "blocked-country" if (request.country in ["XX", "YY"])
```

Each rule condition must be Boolean. Use `when { ... }` instead of `if (...)` when several checks are clearer on separate lines. The text label is optional; the compiler assigns an identifier to an unlabeled rule. Labels appear in decision results and help explain a match.

The decision follows these rules:

1. Any matching `deny` makes the decision deny.
2. Otherwise, any matching `allow` permits the action, subject to its approval requirements.
3. If no allow matches, the fallback decides. It is deny unless the document declares `default allow`.

Conditions of later rules still run after an allow or deny matches. A failing expression aborts evaluation; an earlier allow does not suppress it.

## Declare eligible approvers

An approver declaration names a credential that a requirement can select. For an inline public key:

```edict
approver reviewer {
    type = "public-key"
    id = "treasury-reviewer"
    algorithm = "ED25519"
    publicKey64 = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="
}
```

This is a test public key. Replace it with the reviewer's key. The alias `reviewer` is the name used in source expressions; `id` identifies the approver. Declarations do not themselves request an approval.

To use a registered Signature or WebAuthn credential, pin its returned reference:

```edict
approver reviewer {
    type = "reference"
    id = "treasury-reviewer"
    ref = "treasury-reviewer@sha256:<credential-digest>"
}
```

Replace the placeholder with the exact reference from registration. Keeper resolves and validates that credential when loading the authority. A metadata change does not replace the pinned credential. See [Approvers API](../api-reference/approvers.md) for registration.

## Add approval requirements

```edict
require reviewer if (request.amount > 100)
require 2 of [finance, security] if (request.amount > 500)
```

`require reviewer` means one approval from that approver. `require 2 of [...]` requires two distinct eligible approvers from the list. Omitting the condition makes the requirement unconditional.

A requirement does not grant allow. The action must also pass an allow rule or an allowing fallback. Every matching requirement accumulates and must be satisfied. Another matching allow cannot remove one.

Use separate requirements to express separate checks. For example, one requirement for finance and one for security requires both groups to pass. A single `1 of [finance, security]` accepts either approver.

## Complete reviewed-payment policy

```edict
authority "reviewed-payment" {
    intent = "custom"
    version = "1"

    input request { amount: Number }

    approver reviewer {
        type = "public-key"
        id = "treasury-reviewer"
        algorithm = "ED25519"
        publicKey64 = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="
    }

    policy "reviewed-payment" {
        allow if (request.amount > 0 and request.amount <= 1000)
        require reviewer if (request.amount > 100)
    }
}
```

| Amount | Policy result |
| --- | --- |
| `0` or a negative number | Deny |
| `100` | Allow |
| `100.01` through `1000` | Allow with the reviewer's approval |
| Greater than `1000` | Deny |

Keeper verifies the proof against the operation being signed. The policy only declares the eligible approvers and threshold; it cannot create a proof or accept an unverified assertion that approval happened. [Four-eye control](../security-model/four-eye-control.md) covers preparation, expiry and replay protection.

## Fallback behavior

`default deny` states the normal fallback explicitly. `default allow` permits actions when no allow matches and no deny matches, so it requires careful limits through deny rules.

```edict
default allow require reviewer
```

This attaches a requirement to fallback approval. It applies when no explicit allow matched. An explicit allow does not inherit that fallback requirement. If every permitted action needs a reviewer, use an unconditional `require reviewer` alongside the allow rules.

## Requests containing several actions

Some native intents, including payment mandates, evaluate several actions. Every action must be permitted. One denied action denies the request, and requirements from all permitted actions accumulate. A native policy that receives one list of calls can instead constrain that whole list directly; the intent guide defines which input model it uses.

Next: [Native transaction policies](native-policies.md).
