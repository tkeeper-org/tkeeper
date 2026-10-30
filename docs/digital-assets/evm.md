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

    policy "test-evm-mainnet-usdc-transfer" {
        allow "allow-small-usdc-transfer" when {
            transaction.chainId == 1
            transaction.value == 0
            token.transfer.to == "0x1111111111111111111111111111111111111111"
            token.transfer.amount > 0
            token.transfer.amount <= 100000000
        }
    }
}
```

`address` and `uint256` are EVM wire types. The decoder binds the destination, selector and argument layout to this declaration. A call to another contract or method fails intent validation. `transaction.chainId`, `transaction.value` and `transaction.gasLimit` come from the native transaction. Native contract binding requires a chain id committed by the transaction; use a chain-bound typed transaction such as EIP-1559.

The sample uses test addresses. Replace the contract and recipient with the intended deployed addresses. Token amounts are raw integers: for a six-decimal token, `100000000` means 100 tokens. `transaction.value` is the native value sent with the call, independently of the token amount.

For an allowance, declare `fn approve(spender: address, amount: uint256)` and constrain both fields. For a vault or tuple argument, declare its actual signature and local structs; do not describe effects through a JSON contract catalog.

## Authorizations and permits

The EVM feature also registers these signing intents:

| Intent | Artifact field | Policy roots |
| --- | --- | --- |
| `evm.7702` | `authorization` | `chainId`, `address`, `nonce` |
| `evm.2612` | `permit` | `domain`, `owner`, `spender`, `value`, `nonce`, `deadline` |
| `evm.3009` | `authorization` | `domain`, `operation`, `authorizer`, `nonce`, `transfer` |

`evm.7702` signs the [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) authorization digest `keccak256(0x05 || rlp([chainId, address, nonce]))`. Supply those three fields in `artifact.authorization`. `address` identifies the delegate contract; the zero address revokes delegation. The nonce must be between `0` and `2^64 - 2`. A zero chain ID authorizes use across chains; an authority with `config.chainId = 1` rejects it. Omit the chain pin or set it to zero only when the policy deliberately permits that scope.

```edict
authority "test:evm/delegate" {
    intent = "evm.7702"
    version = "1.0.0"

    config {
        chainId = 1
    }

    policy "delegate" {
        allow when {
            address == "0x1111111111111111111111111111111111111111"
            nonce == 7
        }
    }
}
```

For [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612), supply `domain`, `owner`, `spender`, `value`, `nonce` and `deadline` in `artifact.permit`. The domain contains exactly `name`, `version`, `chainId` and `verifyingContract`; signing uses that EIP-712 domain layout. Other domain layouts and DAI-style permits are rejected. Integer fields accept exact JSON integers or decimal strings.

```edict
authority "test:evm/permit" {
    intent = "evm.2612"
    version = "1.0.0"

    config {
        chainId = 1
    }

    policy "permit" {
        allow when {
            domain.name == "USD Coin"
            domain.version == "2"
            domain.verifyingContract == "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
            spender == "0x1111111111111111111111111111111111111111"
            value <= 100000000
            deadline <= 1800000000
        }
    }
}
```

[ERC-3009](https://eips.ethereum.org/EIPS/eip-3009) uses the same domain layout. Set `operation` to `transferWithAuthorization`, `receiveWithAuthorization` or `cancelAuthorization` inside `artifact.authorization`. Transfer and receive require `from`, `to`, `value`, `validAfter`, `validBefore` and a 32-byte hexadecimal `nonce`. Cancellation requires `authorizer` and `nonce`. Each operation uses its own EIP-712 type hash.

In policy facts, `authorizer` is the signed `from` or `authorizer` address. `transfer` contains `from`, `to`, `value`, `validAfter` and `validBefore` for transfer and receive; it is null for cancellation. Guard access with `transfer != null` and constrain `operation` explicitly. Policy addresses and hexadecimal nonces use lowercase.

```edict
authority "test:evm/receive" {
    intent = "evm.3009"
    version = "1.0.0"

    config {
        chainId = 1
    }

    policy "receive" {
        allow when {
            operation == "receiveWithAuthorization"
            domain.name == "USD Coin"
            domain.version == "2"
            domain.verifyingContract == "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
            transfer != null
            transfer.to == "0x1111111111111111111111111111111111111111"
            transfer.value <= 100000000
            transfer.validBefore <= 1800000000
        }
    }
}
```

The materializers require secp256k1 and verify that `owner`, `from` or `authorizer` matches the requested signing key, including its tweak. `config.chainId`, when present, must match the signed chain ID exactly. Policies must constrain the token domain, delegate or recipient, amount and validity bounds appropriate to the operation. Chain state determines whether a nonce remains usable and whether a deadline has expired.

Use `signature().sign(...)` with the SDK artifacts `Evm7702Authorization`, `Evm2612Permit` or `Evm3009Authorization`. The returned recoverable ECDSA signature signs the protocol digest directly. Submit it through the corresponding authorization tuple or contract method; these intents do not compose an outer transaction.

## Compose

```java
var command = Command.of("test:evm/mainnet-usdc-transfer", new UnsignedEvmTransaction(message64));
var result = client.signature().compose(Sign.of(keyId, command), SignedEvmTransaction.class);
```

The composer returns signed transaction hex and its hash. It supports legacy and typed envelopes supported by Signet; blob broadcasting still needs its sidecar. The wallet constructs nonces and fees, broadcasts the approved bytes and tracks settlement.

See [Edict](../signing-and-authorities/edict.md) for rules and [Authorities](../signing-and-authorities/authorities.md) for OCI publication.
