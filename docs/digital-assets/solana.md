# Solana policies

Build with `-Pkeeper.features=solana -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `solana.transaction`.

`artifact.transaction` contains a Base64 encoded unsigned transaction. Native amounts are lamports; 1 SOL is 1,000,000,000 lamports.

```edict
authority "test:solana/native-transfer" {
    intent = "solana.transaction"
    version = "1.0.0"

    policy "solana-native-transfer" {
        let recipient = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR"
        allow "small-transfer" when {
            requiredSignatures == 1
            effects.all(e -> e.type in ["native.transfer"])
            effects.count(e -> e.type == "native.transfer") == 1
            effects.filter(e -> e.type == "native.transfer").all(e -> e.type == "native.transfer" and e.asset == "sol" and e.to == recipient)
            (effects.filter(e -> e.type == "native.transfer").map(e -> e.amount).sum() > 0)
            (effects.filter(e -> e.type == "native.transfer").map(e -> e.amount).sum() <= 100)
        }
    }
}
```

Roots include `version`, `feePayer`, `recentBlockhash`, `requiredSignatures` and `effects`. The Ed25519 key must be a required signer. The composer attaches that signature and returns the Base64 transaction and `complete`, indicating whether all required signatures are present. Keeper does not resolve address lookup tables or fetch chain state for the request.

## Program interfaces

Declare a program's instruction layout when its arguments and accounts must be checked directly. This is the System Program transfer layout: a four-byte discriminator followed by a little-endian `u64` lamport amount.

```edict
authority "solana-system-transfer" {
    intent = "solana.transaction"
    version = "1"
    program system: solana {
        address = "11111111111111111111111111111111"
        fn transfer(lamports: u64) {
            discriminator = "02000000"
            accounts = [
                {name = "from", signer = true, writable = true},
                {name = "to", signer = false, writable = true}
            ]
        }
    }
    input transfers: List<system.transfer>
    policy "system-transfer" {
        allow when {
            transaction.requiredSignatures == 1
            transfers.count() > 0
            transfers.all(call -> call.accounts.from.address == transaction.feePayer)
            transfers.all(call -> call.accounts.to.address == "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR")
            transfers.all(call -> call.arguments.lamports > 0)
            transfers.sum(call -> call.arguments.lamports) <= 100
        }
    }
}
```

The native binding must consume every instruction. Unknown programs, discriminators, trailing bytes, or incompatible account privileges fail intent validation. Local program structs describe nested wire arguments; use the program's actual Borsh layout and discriminator.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction; the wallet remains responsible for construction, freshness, fees and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
