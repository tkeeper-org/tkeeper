# XRP policies

Build with `-Pkeeper.features=xrp -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `xrp.transaction`.

`artifact.transaction` contains unsigned transaction hex. XRP amounts and fees are drops. 1 XRP is 1,000,000 drops.

```edict
authority "test:xrp/native-payment" {
    intent = "xrp.transaction"
    version = "1.0.0"

    let recipient = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"

    fn permittedPayment(tx: Transaction): Boolean {
        return (tx.type == "payment"
            and tx.lastLedgerSequence != null
            and tx.fee <= 12
            and tx.destination == recipient
            and tx.destinationTag == 0
            and tx.amount != null
            and tx.amount > 0
            and tx.amount <= 100)
    }

    policy "xrp-native-payment" {
        allow "small-payment" if (permittedPayment(transaction))
    }
}
```

`transaction` has type `Transaction`. It includes `type`, `account`, `fee`, `sequence`, `lastLedgerSequence`, `sourceTag`, `flags`, `signingPublicKey`, `destination`, `amount`, `destinationTag`, `payments` and `effects`. The same fields remain available as root inputs. Amounts have type `Integer`.

A payment has an empty `payments` list. For a batch, `destination`, `amount` and `destinationTag` are `null`. Each entry in `transaction.payments` has type `Payment` and exposes its account, destination, amount, fee, sequence, ledger bound, tags, and flags. Pass the transaction or its payments to functions and check every payment and the total.

A missing destination tag is `null`, distinct from tag zero. Keeper checks the native signing account and supports secp256k1 and Ed25519. The composer returns signed transaction hex.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction. The wallet remains responsible for construction, freshness, fees, and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
