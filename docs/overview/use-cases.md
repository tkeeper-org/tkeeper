# Use-case fit

Use TKeeper when the executing system can require a signature from a specific key before acting.

| Scenario | Command | Verifier | Application responsibilities |
| --- | --- | --- | --- |
| AI | MCP tool call, AP2 or MC VI payment, production action | tool backend or credential verifier | model security, sandboxing, and risk detection |
| Digital assets | Bitcoin, EVM, Tron, XRP, or Solana transaction | chain client, broadcaster, or custody backend | transaction construction, broadcast, and settlement monitoring |
| PKI | DER-encoded TBS certificate | relying party or CA pipeline | enrollment, serial allocation, revocation, and certificate publication |
| Other activities | typed privileged command | service that performs the command | business logic and host authorization |

Detailed integration guidance:

- [For AI](../use-cases/for-ai.md)
- [For Digital Assets](../use-cases/for-digital-assets.md)
- [For PKI](../use-cases/for-pki.md)
- [For Other Activities](../use-cases/for-other-activities.md)

## Fit test

Define the integration before choosing a key or authority:

1. What exact effect requires cryptographic authorization?
2. Can that effect be represented as a stable, canonical intent?
3. Which key identity is trusted to authorize it?
4. Which system verifies the proof, and what does it check besides signature validity?
5. Can the effect be produced through a path that bypasses that verifier?
6. Which context must be covered: environment, target, amount, chain, expiry, nonce, or approver verdict?
7. Is one compromised TKeeper node allowed to act as the identity?

An execution path that skips signature verification bypasses TKeeper's controls. If the payload cannot be parsed into an action, `arbitrary` can sign its bytes but cannot enforce intent policy.
