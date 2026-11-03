# Solana policies

Build with `-Pkeeper.features=solana -Pkeeper.platforms=ecc`. Select an OCI authority whose Edict `intent` is `solana.transaction`.

`artifact.transaction` contains a Base64 encoded unsigned transaction. Native amounts are lamports. 1 SOL is 1,000,000,000 lamports.

```edict
authority "test:solana/native-transfer" {
    intent = "solana.transaction"
    version = "1.0.0"

    let recipient = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR"

    fn permittedInstruction(item: Instruction): Boolean {
        if (item.type in ["compute.limit", "compute.price", "memo"]) {
            return true
        }
        return (item.type == "system.transfer"
            and item.call.arguments.to == recipient
            and item.call.arguments.amount != null
            and item.call.arguments.amount > 0
            and item.call.arguments.amount <= 100)
    }

    fn permittedTransaction(tx: Transaction): Boolean {
        return (tx.requiredSignatures == 1
            and tx.instructions.count(item -> item.type == "system.transfer") == 1
            and tx.instructions.all(item -> permittedInstruction(item)))
    }

    policy "solana-native-transfer" {
        allow "small-transfer" if (permittedTransaction(transaction))
    }
}
```

`transaction` has type `Transaction`. It contains `version`, `feePayer`, `recentBlockhash`, `requiredSignatures`, `computeUnitLimit`, `computeUnitPrice`, `instructions` and `effects`. The same fields remain available as root inputs. Each `Instruction` exposes its type, program id, account roles, data hex and decoded `call.arguments`. The example permits compute-budget and memo instructions alongside one native transfer.

The Ed25519 key must be a required signer. The composer attaches that signature and returns the Base64 transaction and `complete`, indicating whether all required signatures are present. Keeper does not resolve address lookup tables or fetch chain state for the request.

## Program interfaces

Declare a program's instruction layout when its arguments and accounts must be checked directly. The System Program transfer encodes a four-byte discriminator followed by a little-endian `u64` lamport amount.

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
    policy "system-transfer" {
        allow when {
            transaction.requiredSignatures == 1
            system.transfer.count() > 0
            system.transfer.all(call -> call.accounts.from.address == transaction.feePayer)
            system.transfer.all(call -> call.accounts.to.address == "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR")
            system.transfer.all(call -> call.lamports > 0)
            system.transfer.sum(call -> call.lamports) <= 100
        }
    }
}
```

With program declarations, `Transaction` contains `version`, `feePayer`, `recentBlockhash`, `requiredSignatures` and `instructionCount`. Decoded instructions appear in each program's namespace. Pass the transaction or a method's call list to functions.

The native binding must consume every instruction. Unknown programs, discriminators, trailing bytes, or incompatible account privileges fail intent validation. Local program structs describe nested wire arguments. Use the program's actual Borsh layout and discriminator.

Use a separate authority id and OCI digest for a different network or action. Broadcast the exact approved transaction. The wallet remains responsible for construction, freshness, fees, and confirmation tracking. See [Edict](../signing-and-authorities/edict.md) for language syntax and [Authorities](../signing-and-authorities/authorities.md) for publication.
