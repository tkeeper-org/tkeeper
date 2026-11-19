# Decisions and approvals

Keeper evaluates the policy's rules together to determine whether an action is allowed and which approvals it needs. Evaluation continues after a rule matches.

## Allow and deny

```edict
allow "small-payment" if (request.amount > 0 and request.amount <= 1000)
deny "blocked-country" if (request.country in ["XX", "YY"])
```

Each rule condition must be Boolean. Use `when { ... }` instead of `if (...)` when several checks are clearer on separate lines. The text label is optional. The compiler assigns an identifier to an unlabeled rule. Labels appear in decision results and help explain a match.

The decision uses the priority `deny > require > allow`.

1. Any matching `deny` makes the decision deny.
2. Matching `require` rules permit the action after every accumulated approval group is satisfied.
3. A matching `allow` permits the action when no approval group is required.
4. When no rule matches, the fallback decides. The implicit fallback is `default deny`.

Conditions of later rules still run after an allow or deny matches. A failing expression stops evaluation even if an earlier rule allowed the action.

## Declare eligible approvers

An approver declaration specifies a credential that a requirement can select. For an inline public key:

```edict
approver reviewer {
    type = "public-key"
    id = "treasury-reviewer"
    algorithm = "ED25519"
    publicKey64 = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="
}
```

This is a test public key. Replace it with the reviewer's key. The alias `reviewer` is the name used in source expressions. `id` identifies the approver. Declarations do not themselves request an approval.

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

A matching requirement permits the action after its approvals are verified. Every matching requirement accumulates and must be satisfied, including when an `allow` also matches. A matching `deny` rejects the action even if all approvals are present.

To require both finance and security approval, declare a requirement for each group. A `1 of [finance, security]` requirement accepts either approver.

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
        allow if (request.amount > 0 and request.amount <= 100)
        require reviewer if (request.amount > 100)
        deny if (request.amount <= 0 or request.amount > 1000)
    }
}
```

| Amount | Policy result |
| --- | --- |
| `0` or a negative number | Deny |
| `100` | Allow |
| `100.01` through `1000` | Allow with the reviewer's approval |
| Greater than `1000` | Deny |

Keeper verifies the proof against the operation being signed. The policy only declares the eligible approvers and threshold. It cannot create a proof or accept an unverified assertion that approval happened. [Four-eye control](../security-model/four-eye-control.md) covers preparation, expiry, and replay protection.

## Fallback behavior

`default deny` rejects actions when no rule matches. `default allow` permits them. `default require` requests approval for them.

```edict
default require reviewer
```

A threshold fallback uses the same requirement syntax.

```edict
default require 2 of [finance, security, treasury]
```

The fallback applies only when no explicit `allow`, `require`, or `deny` matches. All matching explicit requirements accumulate. To require a reviewer for every permitted action, use an unconditional `require reviewer`.

`default allow require reviewer` remains an equivalent spelling of `default require reviewer`. Both forms are supported in `edict-v1`.

## Requests containing several actions

Some native intents, including payment mandates, evaluate several actions. Every action must be permitted. One denied action denies the request, and requirements from all permitted actions accumulate. A native policy that receives one list of calls can instead constrain that whole list directly. The intent guide defines which input model it uses.

Continue with [Native transaction policies](native-policies.md).
