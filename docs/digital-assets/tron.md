# TRON policies

Build with `-Pkeeper.features=tron -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `tron.transaction`.

`artifact.transaction` contains unsigned TRON transaction JSON. Amounts and fees are sun. 1 TRX is 1,000,000 sun.

```edict
authority "test:tron/native-transfer" {
    intent = "tron.transaction"
    version = "1.0.0"
    description = "Sign a TRON native transfer of up to 100 TRX to the configured recipient."

    policy "tron-native-transfer" {
        let recipient = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
        allow "small-transfer" when {
            feeLimit <= 30000000
            effects.all(e -> e.type in ["native.transfer"])
            effects.count(e -> e.type == "native.transfer") == 1
            effects.filter(e -> e.type == "native.transfer").all(e -> e.type == "native.transfer" and e.asset == "trx" and e.to == recipient)
            (effects.filter(e -> e.type == "native.transfer").map(e -> e.amount).sum() > 0)
            (effects.filter(e -> e.type == "native.transfer").map(e -> e.amount).sum() <= 100000000)
        }
    }
}
```

Roots include `hash`, `timestamp`, `expiration`, `feeLimit` and `effects`. The signing key must match the owner of the transaction's only owner-authorized contract. Nonzero permission ids and additional auths are rejected. The composer returns signed transaction JSON. TRC-20/interface authoring is not exposed by this Keeper profile.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction. The wallet remains responsible for construction, freshness, fees, and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
