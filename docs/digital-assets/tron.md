# TRON policies

Build with `-Pkeeper.features=tron -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `tron.transaction`.

`artifact.transaction` contains unsigned TRON transaction JSON with hex addresses. Set `visible` to `false` or omit it. The decoder rejects `visible: true`. The JSON fields must match the protobuf bytes and transaction hash. The composer returns signed JSON with `visible: false`.

TRX amounts and fees are sun. 1 TRX is 1,000,000 sun. Token amounts use raw token units.

## Native transfers

```edict
authority "test:tron/native-transfer" {
    intent = "tron.transaction"
    version = "1.0.0"
    description = "Sign a TRON native transfer of up to 100 TRX to the configured recipient."

    let recipient = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"

    fn permittedTransfer(item: Contract): Boolean {
        return (item.type == "TransferContract"
            and item.to == recipient
            and item.amount != null
            and item.amount > 0
            and item.amount <= 100000000)
    }

    fn permittedTransaction(tx: Transaction): Boolean {
        return (tx.feeLimit <= 30000000
            and tx.contracts.count() == 1
            and tx.contracts.all(item -> permittedTransfer(item)))
    }

    policy "tron-native-transfer" {
        allow "small-transfer" if (permittedTransaction(transaction))
    }
}
```

`transaction` has type `Transaction`. It contains `hash`, `timestamp`, `expiration`, `feeLimit`, `refBlockBytes`, `refBlockHash`, `memoHex`, `contracts` and `effects`. The same fields remain available as root inputs. Each `Contract` exposes its type, owner, and decoded details. Native transfers provide `to` and `amount`. Supported token calls provide the contract address, selector, function and decoded `call.arguments`.

The signing key must match the owner of the transaction's only owner-authorized contract. The decoder rejects nonzero permission ids and additional `auths` entries.

## Contract calls

Declare a TRC-20 method or another contract interface with `contract …: tron`:

```edict
authority "test:tron/trc20-transfer" {
    intent = "tron.transaction"
    version = "1.0.0"

    contract token: tron {
        address = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E"
        fn transfer(to: address, amount: uint256)
    }

    policy "token-transfer" {
        allow when {
            transaction.feeLimit <= 30000000
            transaction.callValue == 0
            transaction.callTokenValue == 0
            transaction.tokenId == 0
            tron.addressEquals(token.transfer.to, "413333333333333333333333333333333333333333")
            token.transfer.amount > 0
            token.transfer.amount <= 100000000
        }
    }
}
```

These are placeholder addresses. Replace the contract and recipient before publication. A declaration pins the contract address and permitted function signatures. Every transaction must contain exactly one declared `TriggerSmartContract` call. Unknown destinations, selectors, malformed arguments, additional contracts, scripts, and nonzero permission ids are rejected before the policy runs.

TRON declarations support EVM ABI integer widths, `address`, `bool`, `string`, `bytes`, `bytesN`, arrays, tuples, and inline structs. An ABI address word contains twelve zero bytes followed by the 20-byte address. The decoder rejects the historical form containing the `41` prefix. See [TRON parameter encoding](https://developers.tron.network/docs/parameter-encoding-and-decoding). Decoded address arguments use Base58Check. `tron.addressEquals` accepts Base58Check and TRON hex, with or without a `0x` prefix.

If the authority declares one method, access its parameters as `token.transfer.amount`. With several declared methods, guard a member with `token.transfer != null` before reading its arguments. Unmatched methods are `null`. Declaring a method permits decoding it. An allow rule must authorize the call.

With a contract declaration, the `Transaction` type exposes `hash`, `timestamp`, `expiration`, `feeLimit`, `refBlockBytes`, `refBlockNum`, `refBlockHash`, `memoHex`, `owner`, `contract`, `callValue`, `callTokenValue`, and `tokenId`. Pass `transaction` to a function to check these fields. Decoded ABI arguments remain in the declared contract namespace. `owner` and `contract` use Base58Check. Numeric fields and ABI integers retain type `Integer`.

`callValue` is the attached TRX amount. `callTokenValue` and `tokenId` describe attached TRC-10 tokens. Constrain these fields even for a token transfer or approval. A policy that omits the corresponding numeric transaction fields cannot accept nonzero attached assets. Decoding does not simulate the contract or inspect its current state.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction. The wallet remains responsible for construction, freshness, fees, and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
