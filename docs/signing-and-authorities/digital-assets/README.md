# Digital Asset Authorities

Build all chains with `-Pkeeper.features=digital-assets -Pkeeper.platforms=ecc`, or select one chain by name. Each authority parses an unsigned transaction, evaluates its effects, and signs only after policy and approval checks pass.

| Chain | Authority | Key | Result from `/compose` | Guide |
| --- | --- | --- | --- | --- |
| Bitcoin | `bitcoin.transaction` | secp256k1 | Raw signature | [Bitcoin](bitcoin.md) |
| EVM | `evm.transaction` | secp256k1 | Signed hex and hash | [EVM](evm.md) |
| Tron | `tron.transaction` | secp256k1 | Signed JSON and hash | [Tron](tron.md) |
| XRP | `xrp.transaction` | secp256k1 or Ed25519 | Signed hex and hash | [XRP](xrp.md) |
| Solana | `solana.transaction` | Ed25519 | Signed Base64, completeness, and optional hash | [Solana](solana.md) |

The caller constructs the unsigned transaction and handles fees, submission, and confirmation. For Bitcoin, Tron, XRP, or Solana signing with a `tweak`, construct the transaction from `central().getPublicKey(keyId, tweak)`; TKeeper checks that derived key against the transaction's owner or required signer. See [Composer](../composer.md) for result behavior.
