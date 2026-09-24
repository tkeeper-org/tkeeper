# Signing and Authorities

TKeeper signs a command after its authority turns it into an intent and policy allows it.

## Sign and compose

- [Signing](signing.md): command requests and verification
- [Composer](composer.md): protocol results from signed commands

## Define and check policy

- [Authorities](authorities.md): attach and govern an identity's capabilities
- [Arbitrary and Typed Authorities](arbitrary-and-typed.md): raw and JSON commands
- [CEL Functions](cel-functions.md): policy expressions
- [Dry Run Policy Evaluation](dry-run.md): preview a decision

## Protocol guides

- [AI and Agentic Payments](../ai/README.md): MCP, AP2, MC Intent
- [Digital Asset Authorities](../digital-assets/README.md): Bitcoin, EVM, Tron, XRP, Solana
- [PKI Authorities](../pki/README.md): X.509 certificates

The consumer must trust the expected identity, verify the signed command, and prevent replay where the action requires freshness.
