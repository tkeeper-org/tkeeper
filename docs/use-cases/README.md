# Use cases

Typed signing follows this path:

```text
command -> authority policy -> signature -> verification -> execution
```

| Use case | Workflow | Authority guide |
| --- | --- | --- |
| AI | [For AI](for-ai.md) | [Agent APIs and payments](../ai/README.md) |
| Digital assets | [For Digital Assets](for-digital-assets.md) | [Chain authorities](../digital-assets/README.md) |
| PKI | [For PKI](for-pki.md) | [X.509](../pki/README.md) |
| Other activities | [For Other Activities](for-other-activities.md) | [Typed authorities](../signing-and-authorities/arbitrary-and-typed.md) |

The downstream system verifies the proof before acting. If an action can bypass that check, Keeper's policy checks cannot prevent it.
