# Use Cases

Every supported action follows the same path:

```text
identity -> understood action -> policy -> proof -> verified execution
```

| Use case | Workflow | Authority guide |
| --- | --- | --- |
| AI | [For AI](for-ai.md) | [MCP and agentic payments](../ai/README.md) |
| Digital assets | [For Digital Assets](for-digital-assets.md) | [Chain authorities](../digital-assets/README.md) |
| PKI | [For PKI](for-pki.md) | [X.509](../pki/README.md) |
| Other activities | [For Other Activities](for-other-activities.md) | [Typed authorities](../signing-and-authorities/arbitrary-and-typed.md) |

The downstream system verifies the proof before acting. If an action can bypass that check, Keeper does not govern it.
