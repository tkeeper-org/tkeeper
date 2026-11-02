# XRP policies

Build with `-Pkeeper.features=xrp -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `xrp.transaction`.

`artifact.transaction` contains unsigned transaction hex. XRP amounts and fees are drops. 1 XRP is 1,000,000 drops.

```edict
authority "test:xrp/native-payment" {
    intent = "xrp.transaction"
    version = "1.0.0"

    policy "xrp-native-payment" {
        let recipient = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
        allow "small-payment" when {
            type == "payment"
            lastLedgerSequence != null
            (fee <= 12)
            effects.all(e -> e.type in ["native.transfer"])
            effects.count(e -> e.type == "native.transfer") == 1
            effects.filter(e -> e.type == "native.transfer").all(e -> e.type == "native.transfer" and e.asset == "xrp" and e.to == recipient and e.destinationTag == 0)
            (effects.filter(e -> e.type == "native.transfer").map(e -> e.amount).sum() > 0)
            (effects.filter(e -> e.type == "native.transfer").map(e -> e.amount).sum() <= 100)
        }
    }
}
```

Roots include `type`, `account`, `fee`, `sequence`, `lastLedgerSequence` and `effects`. A missing destination tag is `null`, distinct from tag zero. Check every effect. An extra batch payment must not bypass recipient or total checks. Keeper checks the native signing account and supports secp256k1 and Ed25519. The composer returns signed transaction hex.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction. The wallet remains responsible for construction, freshness, fees, and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
