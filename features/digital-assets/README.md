# Digital assets

Build `digital-assets` with `ecc` to include Bitcoin, EVM, TRON, XRP, Solana and XLM authorities. Each module checks the native transaction and policy before signing.

| Type | Artifact | Composer result |
| --- | --- | --- |
| Bitcoin | Base64 transaction, previous transactions and selected input | Raw signature |
| EVM | Base64 unsigned transaction bytes | Signed hex |
| TRON | Unsigned transaction JSON | Signed JSON |
| XRP | Unsigned transaction hex | Signed hex |
| Solana | Base64 unsigned transaction | Signed Base64 and completeness flag |
| XLM/Soroban | Base64 unsigned envelope XDR and pinned network passphrase | Signed Base64 envelope |

Select `bitcoin`, `evm`, `tron`, `xrp`, `solana` or `xlm` individually when only one is needed. Solana and XLM use Ed25519; TRON uses secp256k1; XRP supports either. Construct transactions for the actual signing key, including any requested tweak.

See the [policy guides](../../docs/digital-assets/README.md) for schemas, native contract declarations, units and signing boundaries.
