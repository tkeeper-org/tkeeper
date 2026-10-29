# Digital asset authorities

Choose a guide for the native transaction you submit:

- [Bitcoin](bitcoin.md): inputs, outputs, previous transactions and selected-input signing
- [EVM](evm.md): native transfers and contract interfaces
- [TRON](tron.md): owner-authorized transactions
- [XRP](xrp.md): accounts, payments, tags and batches
- [Solana](solana.md): native transfers and program instructions
- [XLM and Soroban](xlm.md): network-bound Stellar envelopes and contract calls

Policies use [Edict](../signing-and-authorities/edict.md). The modules decode native bytes and supply the policy inputs. The client constructs and broadcasts the approved transaction and tracks settlement.
