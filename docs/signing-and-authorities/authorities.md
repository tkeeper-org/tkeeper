# Authorities

An authority defines the commands a key may sign. Keeper validates the Edict document loaded from its OCI artifact. Key activation requires successful policy compilation. Each participating keeper checks the command against its own pinned authority before contributing a signature share.

## Attach an authority

```json
["oci://registry.example/edict/authorities/payment-limits@sha256:..."]
```

The authority id comes from `authority "payment-limits"`. After validation, Keeper stores it with the reference in the key metadata. Requests supply references only. A key cannot have multiple authority documents with the same id. Use a digest-pinned reference. Registry tags can change. `version` inside the document does not pin its contents. Changes to a schema, network, contract interface, rule or approver require a new artifact digest and key-authority update.

Keep unrelated actions under separate authority ids. Rules within one authority can express amount ranges or different approval requirements for the same action.

`arbitrary` permits raw signing when `keeper.authority.arbitrary.enabled` is enabled. Pass `["arbitrary"]`. It has no OCI document and must be the key's only authority. An OCI document cannot declare an arbitrary intent.

## Write the document

Examples use test addresses, networks, and keys. Replace them and review the limits before publishing your authority.

Use [Writing Edict policies](edict.md) for types, `struct`, `input`, maps, functions, decisions, and approval rules. For custom JSON commands, the document defines the complete schema. The module decodes native bytes into protocol roots.

| Intent | Build feature | Policy guide |
| --- | --- | --- |
| `custom` | Core | [Typed JSON](arbitrary-and-typed.md) |
| `bitcoin.transaction` | `bitcoin` | [Bitcoin](../digital-assets/bitcoin.md) |
| `evm.transaction` | `evm` | [EVM](../digital-assets/evm.md) |
| `evm.7702` | `evm` | [EVM](../digital-assets/evm.md) |
| `evm.2612` | `evm` | [EVM](../digital-assets/evm.md) |
| `evm.3009` | `evm` | [EVM](../digital-assets/evm.md) |
| `tron.transaction` | `tron` | [TRON](../digital-assets/tron.md) |
| `xrp.transaction` | `xrp` | [XRP](../digital-assets/xrp.md) |
| `solana.transaction` | `solana` | [Solana](../digital-assets/solana.md) |
| `xlm.transaction` | `xlm` | [XLM and Soroban](../digital-assets/xlm.md) |
| `x509.tbs-certificate` | `x509` | [X.509](../pki/x509.md) |
| `ap2.mandate` | `ap2` | [AP2](../ai/agentic-payments/ap2.md) |
| `mcintent.mandate` | `mc-vi` | [Mastercard VI](../ai/agentic-payments/mcintent.md) |

ECC features require the `ecc` platform. See [Build and features](../deployment/build-and-features.md) for selectors.

## Publish and load

An authority artifact contains one UTF-8 `authority.edict` layer. Keeper uses the Edict media types. JSON and YAML policy documents are not accepted. OCI manifests and signing API requests remain JSON.

Allow registries explicitly, including any port:

```hocon
oras {
  allowed-registries = ["registry.example"]
}
```

An empty allowlist denies pulls. A local HTTP registry also needs `oras.insecure = true`. Separate token services and redirected blob downloads use the [ORAS origin settings](../deployment/configuration.md#oras).

## Enforcement and errors

A matching deny rule rejects the request. Approval groups accumulate across matching `require` rules and the key's four-eye policy. A multi-action payment request must pass policy for every action. [Dry run](dry-run.md) previews the decision. Signing repeats the checks.

| Error | What to inspect |
| --- | --- |
| `INVALID_AUTHORITY` | Document syntax, types, config, id, approvers, OCI reference, or compilation limits |
| `AUTHORITY_VIOLATION` | Whether the key has the selected authority id |
| `INVALID_AUTHORITY_ARTIFACT` | Artifact shape, signed JSON schema, signing account, or key algorithm |
| `INVALID_INTENT` | Native decoding, network binding, or an undeclared protocol call |
| `POLICY_VIOLATION` | A deny rule or absence of an allow |
| `APPROVAL_REQUIRED` | Every required approval group's threshold and eligible keys |

See [Four-eye control](../security-model/four-eye-control.md) for approvals and [Quorum modes](../security-model/quorum-modes.md) for threshold assumptions. The consumer must execute or broadcast the command that was signed and enforce its freshness requirements.
