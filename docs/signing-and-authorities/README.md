# Signing and Authorities

Signing is an identity action. TKeeper produces a signature only after the requested action is understood through an authority and allowed by policy.

Read:

- [Signing](signing.md)
- [Composer](composer.md)
- [MCP connection and tools](mcp.md)
- [Authorities](authorities.md)
- [Dry Run Policy Evaluation](dry-run.md)
- [CEL Functions](cel-functions.md)
- [Arbitrary and Typed Authorities](arbitrary-and-typed.md)
- [Digital Asset Authorities](digital-assets/README.md)
  - [Bitcoin](digital-assets/bitcoin.md)
  - [EVM](digital-assets/evm.md)
  - [Tron](digital-assets/tron.md)
  - [XRP](digital-assets/xrp.md)
  - [Solana](digital-assets/solana.md)
- [Agentic Payment Authorities](agentic-payments.md)
- [X.509 Authorities](x509.md)

## Core rule

```text
command -> authority -> intent -> policy -> proof
```

Use `arbitrary` only when raw signing is intentional. Use concrete authorities when TKeeper must understand and govern the action.

The consumer remains part of the security boundary: it must trust the expected identity, verify the exact intent, and prevent replay where the action requires freshness.
