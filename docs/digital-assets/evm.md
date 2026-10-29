# EVM policies

Build with `-Pkeeper.features=evm -Pkeeper.platforms=ecc`. Submit the unsigned transaction bytes as Base64 in `artifact.message64`.

For native transfers, `config.chainId` pins the network; roots include `chainId`, `to`, `value`, `gasLimit`, `transaction` and `effects`. Values are wei. For contract calls, declare the contract and ABI signatures in the Edict document:

```edict
authority "test:evm/mainnet-usdc-transfer" {
    intent = "evm.transaction"
    version = "1.0.0"
    title = "Mainnet USDC transfer limit"

    config {
        chainId = 1
    }

    contract token: evm {
        address = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
        fn transfer(to: address, amount: uint256)
    }

    input transfer: token.transfer

    policy "test-evm-mainnet-usdc-transfer" {
        allow "allow-small-usdc-transfer" when {
            transaction.chainId == 1
            transaction.value == 0
            transfer.arguments.to == "0x1111111111111111111111111111111111111111"
            transfer.arguments.amount > 0
            transfer.arguments.amount <= 100000000
        }
    }
}
```

`address` and `uint256` are EVM wire types. The decoder binds the destination, selector and argument layout to this declaration. A call to another contract or method fails intent validation. `transaction.chainId`, `transaction.value` and `transaction.gasLimit` come from the native transaction. Native contract binding requires a chain id committed by the transaction; use a chain-bound typed transaction such as EIP-1559.

The sample uses test addresses. Replace the contract and recipient with the intended deployed addresses. Token amounts are raw integers: for a six-decimal token, `100000000` means 100 tokens. `transaction.value` is the native value sent with the call, independently of the token amount.

For an allowance, declare `fn approve(spender: address, amount: uint256)` and constrain both fields. For a vault or tuple argument, declare its actual signature and local structs; do not describe effects through a JSON contract catalog.

## Compose

```java
var command = Command.of("test:evm/mainnet-usdc-transfer", new UnsignedEvmTransaction(message64));
var result = client.signature().compose(Sign.of(keyId, command), SignedEvmTransaction.class);
```

The composer returns signed transaction hex and its hash. It supports legacy and typed envelopes supported by Signet; blob broadcasting still needs its sidecar. The wallet constructs nonces and fees, broadcasts the approved bytes and tracks settlement.

See [Edict](../signing-and-authorities/edict.md) for rules and [Authorities](../signing-and-authorities/authorities.md) for OCI publication.
