# Use Cases

Every supported use case has the same enforcement shape:

```text
identity -> understood action -> policy -> proof -> verified execution
```

## Guides

- [For AI](for-ai.md): MCP, governing MCP actions, AP2 and MC VI payments
- [For Digital Assets](for-digital-assets.md): Bitcoin, EVM, Tron, XRP, Solana
- [For PKI](for-pki.md): X.509 certificate issuance
- [For Other Activities](for-other-activities.md): typed internal commands

The integration is a good fit when:

- the action has real consequences
- the action can be represented as an intent
- the downstream system can verify proof before execution
- bypassing the governed identity is not allowed

If the action can happen without the proof, TKeeper is not enforcing that path. If the goal is only secret storage, use a secrets manager.
