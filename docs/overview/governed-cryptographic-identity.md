# Governed Cryptographic Identity

A governed cryptographic identity is a key with rules for its use. An authority document attached to the key defines the accepted command format and policy. A caller with signing permission still has to satisfy that policy.

For example, a treasury key can allow USDC transfers only to one operating wallet. A CA key can allow certificates only for a specified DNS name and validity period. An agent key can allow a typed restart command only for one service and environment.

TKeeper parses each command into an intent for policy evaluation and signs the command's defined signing material after the checks pass. The receiving system verifies that material against the expected key. See [Typed JSON signing material](../signing-and-authorities/arbitrary-and-typed.md#typed-json-signing-material) for the `custom` encoding.

## Why this matters

An agent or service can hold permission to request signatures without having unrestricted use of the key. Authority policy can constrain recipients, amounts, certificate fields, or service commands.

TKeeper also checks key lifecycle state, required approvals, audit availability, and quorum participation. A denied request returns no signature. Raw `arbitrary` signing has no intent policy and is disabled by default.

## Enforcement boundary

The receiving system must require a valid signature before executing the action:

```text
1. Caller prepares a command
2. TKeeper checks the command and returns a signature if allowed
3. Receiving system verifies the key, signature, and signed content
4. Receiving system checks freshness and executes the action
```

If another API or credential can perform the same action without this verification, that path bypasses TKeeper's policy.

## Verifier contract

A valid signature binds a key to specific bytes. The verifier must check that those bytes describe the action it will execute and that the authorization is still acceptable.

The verifier should:

- trust the expected identity or public key, not any mathematically valid key
- reconstruct or validate the exact intent that will be executed
- bind the proof to the correct environment, target, and operation
- enforce nonce, expiry, sequence, or idempotency rules where replay matters
- reject fields or effects that were not covered by the governed intent

Accepting different content, acting on unsigned fields, or reusing a one-time authorization can bypass the policy that approved the original command.

## Authority path

The authority path runs from the request to the system that executes it. Each stage checks the same action:

| Stage | Question |
| --- | --- |
| Intent | What exact action is being requested, and is it understood? |
| Policy | Is this action allowed for this key identity, caller, and authority? |
| Quorum | Do enough peers accept the same action? |
| Audit | Can the decision be recorded before the effect? |
| Proof | What cryptographic output binds this identity to the approved action? |

Bind policy inputs and approvals to the signed command. A verdict about a different recipient or amount does not authorize the transaction being signed.

## Relation to external risk systems

External checks can supply decisions used by authority policy:

- prompt-injection detection
- AML or KYT checks
- fraud scoring
- business approvals
- SIEM or SOAR decisions
- human review

Include the decision and its action binding in the governed command, and validate them in policy. The binding must cover the action that is signed and executed.
