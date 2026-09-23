# Composer

`POST /v2/keeper/compose` accepts the same `Sign` request as `/v2/keeper/sign` and requires `tkeeper.key.{keyId}.sign`. TKeeper checks the key's authority, policy, approvals, and signing controls, then passes the signature to the composer registered for the command type.

| Command type | Compose result |
| --- | --- |
| `evm.transaction` | `SignedEvmTransaction`: signed hex and transaction hash |
| `tron.transaction` | `SignedTronTransaction`: signed JSON and transaction hash |
| `xrp.transaction` | `SignedXrpTransaction`: signed hex and transaction hash |
| `solana.transaction` | `SignedSolanaTransaction`: signed Base64, `complete`, and hash when complete |
| `ap2.mandate`, `mcintent.mandate` | `PaymentCredential`: signed credential layer |
| Other types, including `bitcoin.transaction` | `ThresholdSignature`: raw signature, as with `/sign` |

The result also carries `generation` and `imposters`. Composition does not broadcast a transaction or submit a credential to a merchant.

## SDK example

Build an unsigned EVM transaction first. Its serialized bytes go in `message64` as Base64:

```java
var command = Command.of(authorityId, new UnsignedEvmTransaction(message64));
var result = client.signature().compose(
        Sign.of(keyId, command), SignedEvmTransaction.class);
String rawTransaction = result.rawTransaction();
String transactionHash = result.transactionHash();
```

Use `signature().compose(request)` for an untyped JSON result, or pass the expected result class. `signature().sign(request)` still returns only the raw signature.

See the [digital asset authorities](digital-assets/README.md) and [agentic payments](agentic-payments/README.md) for input formats, policies, and result limits.
