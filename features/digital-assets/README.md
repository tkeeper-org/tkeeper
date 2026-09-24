# Digital assets

Bitcoin, EVM, Tron, XRP, and Solana transaction authorities are separate modules under
`digital-assets`. They use the normal authority, policy, approval, and signing
pipeline and require the `ecc` platform. Tron uses secp256k1, Solana uses Ed25519,
and XRP accepts either. Pass the unsigned Signet dump in the SDK artifact's
`transaction` field: JSON for Tron, hex for XRP, and Base64 for Solana.
`signature().compose(...)` signs and returns `SignedTronTransaction`,
`SignedXrpTransaction`, or `SignedSolanaTransaction`. Each contains the signed
transaction in the same wire format and its transaction hash. Solana also
reports `complete`: a transaction with other missing signatures is partial and
may not have a hash yet. EVM composition returns `SignedEvmTransaction` with
the signed hex transaction and hash.

Build a runtime containing both digital assets and agentic payments:

```sh
./gradlew :build -Pkeeper.features=agentic-payments,digital-assets -Pkeeper.platforms=ecc
```

Select `bitcoin`, `evm`, `tron`, `xrp`, or `solana` individually when only one is
needed. The previous `authority-bitcoin` and `authority-evm` selectors remain
accepted.

For tweaked Bitcoin, Tron, XRP, or Solana signatures, construct the unsigned transaction with the derived public key from `central().getPublicKey(keyId, tweak)`.

See the separate [Bitcoin](../../docs/digital-assets/bitcoin.md),
[EVM](../../docs/digital-assets/evm.md),
[Tron](../../docs/digital-assets/tron.md),
[XRP](../../docs/digital-assets/xrp.md), and
[Solana](../../docs/digital-assets/solana.md) authority guides.

See [For Digital Assets](../../docs/use-cases/for-digital-assets.md) for a policy and SDK example.
