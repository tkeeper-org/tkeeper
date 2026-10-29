# Native transaction policies

A native intent derives policy inputs from the submitted transaction, certificate or payment mandate. Its decoder determines the meaning of those fields. A client cannot supply a separate JSON description in place of the native bytes.

## Choose the intent and configuration

The `intent` property selects the decoder and available inputs. Configuration pins values required by that intent, such as a chain id or Stellar network passphrase:

```edict
config { chainId = 1 }
```

Use the configuration and units from the relevant guide:

| Intent | Guide | What to constrain |
| --- | --- | --- |
| `bitcoin.transaction` | [Bitcoin](../digital-assets/bitcoin.md) | Outputs, fee, selected input and sighash |
| `evm.transaction` | [EVM](../digital-assets/evm.md) | Chain, native value, fees and declared contract calls |
| `tron.transaction` | [TRON](../digital-assets/tron.md) | Native transfer effects and transaction fields |
| `xrp.transaction` | [XRP](../digital-assets/xrp.md) | Payment type, destination, amount and flags |
| `solana.transaction` | [Solana](../digital-assets/solana.md) | Program, instructions, account roles and transfer amounts |
| `xlm.transaction` | [XLM and Soroban](../digital-assets/xlm.md) | Network, operations, amounts and declared invocations |
| `x509.tbs-certificate` | [X.509](../pki/x509.md) | Certificate subject, issuer, validity and extensions |
| `ap2.mandate` | [AP2](../ai/agentic-payments/ap2.md) | Mandate chain, merchant, currency and purchase amounts |
| `mcintent.mandate` | [Mastercard VI](../ai/agentic-payments/mcintent.md) | Credential context and requested payment actions |

Each guide contains a complete authority and the API artifact it accepts. Build Keeper with the required feature and platform before loading it.

## Declare an EVM call

```edict
authority "token-transfer" {
    intent = "evm.transaction"
    version = "1"
    config { chainId = 1 }

    contract token: evm {
        address = "0x1111111111111111111111111111111111111111"
        fn transfer(to: address, amount: uint256)
    }

    input transfer: token.transfer

    policy "token-transfer" {
        allow when {
            transaction.chainId == 1
            transaction.value == 0
            transfer.arguments.to == "0x2222222222222222222222222222222222222222"
            transfer.arguments.amount > 0
            transfer.arguments.amount <= 100000000
        }
    }
}
```

These are placeholder addresses. Replace them with the intended deployed contract and recipient. The method signature describes the ABI bytes to decode. `input transfer: token.transfer` binds the decoded call to a root, exposing arguments under `transfer.arguments`. `transaction` exposes native transaction facts.

The decoder checks the declared destination, selector and argument layout before the rules run. Native integer arguments and integral transaction facts have Edict type `Integer`; amounts remain in raw token units. An EVM `uint256` also defines native encoding and range checks that an ordinary JSON `Integer` declaration does not provide.

## Wire structs and ordinary structs

A `struct` inside a contract or program describes a native argument layout using that protocol's wire types. A document-level struct describes ordinary Edict data using `Text`, `Integer`, `Number`, `Boolean`, lists, maps and optional values.

For EVM, use the actual ABI signature and tuple layouts. For Soroban, declare its contract address, method and XDR value types. For Solana, declare the program, instruction discriminator, argument layout and required account roles. These declarations do not fetch an ABI, spec or IDL from the network.

A declaration only works when Keeper has installed the corresponding module. It cannot load an extension from a file or URL. An unknown module or incompatible layout is rejected.

Several contract or program declarations may share an address. Their methods are combined; the aliases keep their own names for input declarations. For example, one EVM block may describe `transfer` and another `approve` at the same token address. Conflicting descriptions of one selector or method, and overlapping Solana instruction discriminators, are rejected when Keeper loads the authority. Each native call must still match exactly one declared input root.

## Cover the whole action

A permitted call name alone is insufficient. Constrain the arguments that carry value or authority: recipient, spender, amount, account roles and any grant being made. Also constrain transaction-level fields that matter, such as native value, fee, chain or network.

Check counts and allowed operation types when extra actions must be rejected. A transaction containing one permitted transfer and another operation needs an explicit whole-transaction policy. `all` on an empty list is true, so combine it with a count when at least one call is required.

Decoding establishes what the submitted bytes contain. It does not simulate contract execution, prove a token's price or fetch current chain state. The application constructs transactions, supplies any required trusted context, broadcasts the approved bytes and checks settlement.

Next: [Errors and execution limits](errors-and-limits.md).
