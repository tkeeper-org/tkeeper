# For Digital Assets

TKeeper parses an unsigned transaction, evaluates its effects against the key's authority, then signs. The transaction builder handles nonce or UTXO selection, fees, and broadcast.

```sh
./gradlew shadowJar -Pkeeper.features=digital-assets -Pkeeper.platforms=ecc
```

Select `bitcoin`, `evm`, `tron`, `xrp`, or `solana` to build one authority.

| Authority | SDK artifact | Key | Compose result |
| --- | --- | --- | --- |
| `bitcoin.transaction` | `UtxoInput` | secp256k1 | Signature only |
| `evm.transaction` | `UnsignedEvmTransaction.message64` (Base64) | secp256k1 | Signed transaction hex and hash |
| `tron.transaction` | `UnsignedTronTransaction.transaction` (JSON) | secp256k1 | Signed transaction JSON and hash |
| `xrp.transaction` | `UnsignedXrpTransaction.transaction` (hex) | secp256k1 or Ed25519 | Signed transaction hex and hash |
| `solana.transaction` | `UnsignedSolanaTransaction.transaction` (Base64) | Ed25519 | Signed transaction Base64, `complete`, and hash when complete |

## Example: limit a Tron transfer

This authority permits one recipient and at most 100 TRX. Tron transfer amounts and `feeLimit` are measured in [sun](https://developers.tron.network/docs/token-standards-trx); 100 TRX is 100,000,000 sun.

```yaml
schemaVersion: verdict.authority/v1
id: test:tron/native-transfer
type: tron.transaction
version: 1.0.0
config: {}
policy:
  id: tron-native-transfer
  fallback: DENY
  variables:
    recipient: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
  allow:
    - id: small-transfer
      where:
        - "feeLimit <= 30000000"
        - "effect.onlyTypes(effects, ['native.transfer'])"
        - "effect.one(effects, 'native.transfer')"
        - "effect.all(effects, 'native.transfer', {'asset': 'trx', 'to': recipient})"
        - "bigint.gt(effect.amount(effects, 'native.transfer'), '0')"
        - "bigint.lte(effect.amount(effects, 'native.transfer'), '100000000')"
```

Attach the [complete authority document](../../integration-tests/src/testFixtures/resources/authorities/tron/native-transfer.yaml) to a secp256k1 key through a digest-pinned OCI reference. Build the unsigned transaction with that key as its owner. Sign and compose it:

```java
var artifact = new UnsignedTronTransaction(unsignedTronJson);
var command = Command.of("test:tron/native-transfer", artifact);
var signed = client.signature().compose(
        Sign.of(tronKeyId, command), SignedTronTransaction.class);
String transactionJson = signed.rawTransaction();
String transactionHash = signed.transactionHash();
```

The integration test checks the owner key, policy boundary, unchanged transaction body, signature, and returned hash. The broadcaster still decides when and where to submit `transactionJson`.

When signing with a `tweak`, build Bitcoin, Tron, XRP, or Solana transactions from the public key returned by `central().getPublicKey(keyId, tweak)`. Keeper checks the transaction's owner or required signer against that derived key on every participating peer.

For XRP, policy amounts are [drops](https://xrpl.org/docs/introduction/transactions-and-requests); for Solana, native transfer amounts are [lamports](https://solana.com/docs/references/terminology). Use raw protocol units in limits. EVM composition covers legacy and typed transactions 1–4; type 3 broadcast also needs its blob sidecar. Solana can return a partial transaction: check `complete` before broadcasting.

See the separate [Bitcoin](../signing-and-authorities/digital-assets/bitcoin.md), [EVM](../signing-and-authorities/digital-assets/evm.md), [Tron](../signing-and-authorities/digital-assets/tron.md), [XRP](../signing-and-authorities/digital-assets/xrp.md), and [Solana](../signing-and-authorities/digital-assets/solana.md) authority guides.
