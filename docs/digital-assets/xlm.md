# XLM and Soroban policies

Build with `-Pkeeper.features=xlm -Pkeeper.platforms=ecc`. The module uses `xlm.transaction` and Ed25519 keys.

The artifact contains the unsigned envelope XDR as Base64 and the network passphrase:

```json
{"transaction":"BASE64_UNSIGNED_ENVELOPE_XDR","networkPassphrase":"Standalone Network ; February 2017"}
```

The authority pins `networkPassphrase`. Keeper rejects a request with another passphrase. Stellar's XDR does not contain the network: the passphrase participates in the signing hash. The key must match the transaction source account, or the outer fee source for a fee-bump envelope. Muxed addresses are compared through their underlying account id.

## Native payment

```edict
authority "test:xlm/native-payment" {
    intent = "xlm.transaction"
    version = "1.0.0"
    description = "Sign one native XLM payment of up to 2 XLM to the configured recipient."
    config { networkPassphrase = "Standalone Network ; February 2017" }

    policy "xlm-payment" {
        allow when {
            type == "v1"
            fee <= 1000
            sequence > 0
            operations.count() == 1
            effects.count() == 1
            effects.all(effect -> effect.type == "native.transfer")
            effects.all(effect -> effect.to == "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U")
            effects.sum(effect -> effect.amount) > 0
            effects.sum(effect -> effect.amount) <= 20000000
        }
    }
}
```

Amounts and fees are stroops. 1 XLM is 10,000,000 stroops. The example permits one native payment and rejects extra operations, issued-asset payments and fee-bump envelopes. Change the recipient, network, and limits for the deployed authority.

The native profile exposes `type`, `hash`, `networkId`, `source`, `sourceAccount`, `feeSource`, `feeSourceAccount`, `fee`, `sequence`, `envelopeXdr`, `operations`, `effects` and optional `inner` fee-bump metadata. Each operation remains visible. Native payment effects include destination account and muxed-id fields. Other operations have distinct `xlm.*` effect types. Explicitly allow the types you intend to sign.

## Soroban call

```edict
authority "test:xlm/soroban-limit" {
    intent = "xlm.transaction"
    version = "1.0.0"
    config { networkPassphrase = "Standalone Network ; February 2017" }

    contract limits: soroban {
        address = "CADAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMSST"
        fn set_limit(period: symbol, amount: u32)
    }

    policy "soroban-limit" {
        allow when {
            transaction.fee > 0 and transaction.fee <= 1000000
            transaction.sequence > 0
            limits.set_limit.count() == 1
            limits.set_limit.all(call -> call.period == "daily")
            limits.set_limit.sum(call -> call.amount) <= 100
        }
    }
}
```

`symbol` and `u32` are Soroban wire types. The decoder checks the declared contract, method and argument layouts, including bounds. `limits.set_limit` contains the decoded invocations with direct `period` and `amount` fields. Transaction facts come from the native envelope.

This profile accepts v1 invocation envelopes with source-account authorization for the exact call. Different operation sources, address credentials, nested authorization grants, undeclared methods and additional non-invocation operations are rejected. It does not simulate a contract, fetch its state or authorize arbitrary grants on behalf of another account.

## Sign and compose

```java
var artifact = new UnsignedXlmTransaction(envelope64, networkPassphrase);
var command = Command.of("test:xlm/native-payment", artifact);
var signed = client.signature().compose(Sign.of(keyId, command), SignedXlmTransaction.class);
```

The composer verifies the Ed25519 signature and returns the signed envelope as Base64 in `rawTransaction`, plus `transactionHash`. A fee-bump signature covers the outer envelope and preserves the inner transaction and its signatures. The client broadcasts the returned envelope and checks network state, sequence, validity bounds, and settlement.

To sponsor a fee, attach an authority that explicitly permits `type == "fee_bump"` to the outer fee source's key. The preceding native-payment example permits only v1 envelopes. A fee-bump policy should constrain the outer `fee` and the additional `xlm.fee_bump` effect. The policy must also check each inner operation and its effects. A fee bump requires authorization from the outer fee source, even if another source signed the inner transaction.

See [Edict](../signing-and-authorities/edict.md) for syntax and [Authorities](../signing-and-authorities/authorities.md) for OCI publication.
