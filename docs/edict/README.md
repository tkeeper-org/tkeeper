# Edict policy language

Edict describes which actions an authority permits and when those actions need approval. A document contains the input types, constants, functions and rules needed to make that decision. Keeper validates the document before attaching it to a key, then evaluates it for each signing request.

Start with [Your first policy](getting-started.md). It walks through a complete document, the JSON it accepts, and the decisions it produces. The remaining pages explain the language in the order you need it:

| Page                                                      | Examples                                             |
|-----------------------------------------------------------|-----------------------------------------------------------------|
| [Document structure and syntax](syntax.md)                | An authority, declarations, literals, and named rules            |
| [Types and input schemas](types-and-inputs.md)            | Reusable structs, required fields, defaults, and optional values |
| [Expressions and numbers](expressions.md)                 | Conditions, comparisons, and exact arithmetic                    |
| [Functions and collections](functions-and-collections.md) | Reusable checks, list operations, sorted maps, and loops         |
| [Decisions and approvals](decisions-and-approvals.md)     | Allow and deny rules, thresholds, and fallback behavior          |
| [Native transaction policies](native-policies.md)         | Contract and program interfaces tied to the bytes being signed  |
| [Errors and execution limits](errors-and-limits.md)       | Compilation failures, invalid inputs, and bounded execution      |

## Choose the input model

For an app command expressed as JSON, use the `custom` intent. Its document declares exactly one input root named `request`. Keeper uses that declaration to check types and defaults, then exposes the resulting command schema through its control plane.

For a transaction, certificate or payment mandate, use the corresponding native intent. Keeper derives its inputs from the submitted artifact. EVM, Solana and Soroban policies can declare the native call layouts they accept. The [native policy guide](native-policies.md) explains how this differs from a custom JSON input.

## Use the policy in Keeper

The policy produces a decision and any approval requirements. Keeper also checks caller permissions, the selected authority, the signing key, and approval proofs. A document cannot query a network, load a file or change a key's permissions.

An authority is loaded from a digest-pinned OCI artifact. Changing its schema, rules or declared native interface requires a new artifact digest. See [Authorities](../signing-and-authorities/authorities.md) for publishing and attachment, [Signing](../signing-and-authorities/signing.md) for API requests and [Four-eye control](../security-model/four-eye-control.md) for collecting proofs.

Examples use test addresses and keys. Replace them and review the limits before deploying a policy.
