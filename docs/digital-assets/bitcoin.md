# Bitcoin policies

Build with `-Pkeeper.features=bitcoin -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `bitcoin.transaction`.

`artifact` contains `unsignedTransaction64`, `previousTransactions64` and `signInputIndex`. The transaction and previous transactions are Base64 encoded. Amounts and fees are satoshis.

```edict
authority "test:bitcoin/btc-small-output" {
    intent = "bitcoin.transaction"
    version = "1.0.0"
    title = "BTC small output with safe sighash"

    config {
        network = "MAINNET"
    }

    policy "test-bitcoin-btc-small-output" {
        allow "allow-small-btc-output" when {
            protocol == "BTC"
            sighash.all
            not sighash.anyoneCanPay
            effects.all(e -> e.type in ["utxo.spend", "utxo.output", "utxo.fee"])
            (effects.filter(e -> e.type == "utxo.output").map(e -> e.amount).sum() <= 100000)
            (effects.filter(e -> e.type == "utxo.fee").map(e -> e.amount).sum() <= 10000)
        }
    }
}
```

Use `outputs`, `inputs`, `fee`, `sighash`, `signing` and `effects` to constrain the whole transaction. The example limits total output and fee. Add an explicit destination check for your wallet. Keeper signs the selected input with `SIGHASH_ALL`. It returns a signature. There is no Bitcoin transaction composer. The wallet constructs and broadcasts the final transaction.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction. The wallet remains responsible for construction, freshness, fees, and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
