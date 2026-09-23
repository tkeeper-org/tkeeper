# Bitcoin Authorities

Bitcoin authority support lives in the `digital-assets:bitcoin` module and currently requires the `ecc` platform.

Build example:

```bash
./gradlew shadowJar -Pkeeper.features=bitcoin -Pkeeper.platforms=ecc
```

A Bitcoin authority lets TKeeper parse unsigned transaction data, previous transactions, signing input, sighash settings, and policy effects before signing.

```java
var input = new UtxoInput(unsignedTransaction64, previousTransactions64, inputIndex);
var command = Command.of("btc-cold-storage-sweep", input);
var signature = client.signature().sign(Sign.of(bitcoinKeyId, command));
```

`unsignedTransaction64` and each previous transaction are Base64-encoded transaction bytes. The wallet attaches the returned signature to the selected input. Bitcoin has no registered composer; `/v2/keeper/compose` returns the raw `ThresholdSignature`.

Use Bitcoin authorities for:

- governed UTXO spending
- treasury withdrawals
- fee and output policy
- external risk verdicts before signing

## Enforcement boundary

Policy evaluation depends on the unsigned transaction, the selected input and sighash mode, and the previous transactions needed to understand input values. Missing or unclassifiable data must not be treated as a harmless unknown effect.

TKeeper does not select coins, construct change, choose fees, broadcast transactions, or track confirmations. The wallet or custody service must broadcast the exact approved transaction and ensure that its sighash choice covers the fields the policy assumes are fixed.

## Authority config

```yaml
type: bitcoin.transaction
config:
  network: MAINNET
```

Verdict 0.2 supports Bitcoin networks `MAINNET`, `TESTNET`, `REGTEST`, and `SIGNET`. TKeeper signs the selected artifact input with `SIGHASH_ALL`.

Effects:

- `utxo.spend`
- `utxo.output`
- `utxo.data`
- `utxo.fee`

Strict CEL roots:

- `protocol`, `network`, `asset`, `assetDecimals`
- `txId`, `wtxId`, `version`, `lockTime`
- `sighash`, `signing`
- `inputs`, `outputs`, `previousTransactions`
- `totalInput`, `totalOutput`, `fee`, `effects`

Intent validation rejects malformed or signed transactions, missing or duplicate previous transactions, missing outputs, coinbase inputs, unknown scripts, negative fees, invalid signing inputs, and unsafe or unknown sighash modes.

## Authority example: cold-storage sweep

This authority represents one logical action: sweep BTC into one cold-storage address. It allows sweeps up to 0.25 BTC directly and requires one treasury approval above 0.25 and up to 1 BTC. The fee is capped at 100,000 satoshis. A transaction with change, an additional output, another destination, or another sighash mode is denied.

```yaml
schemaVersion: verdict.authority/v1
id: btc-cold-storage-sweep
type: bitcoin.transaction
version: 1.0.0

metadata:
  title: BTC sweep to cold storage

config:
  network: MAINNET

policy:
  id: btc-cold-storage-sweep
  fallback: DENY
  approvers:
    treasury-reviewer:
      algorithm: ED25519
      publicKey64: "BASE64_ENCODED_ED25519_PUBLIC_KEY"
  variables:
    coldStorageAddress: "bc1qreplacewiththeapprovedaddress"
    automaticLimit: "25000000"
    reviewedLimit: "100000000"
    maximumFee: "100000"
  allow:
    - id: automatic-sweep
      where:
        - "protocol == 'BTC'"
        - "sighash.all && !sighash.anyoneCanPay"
        - "effect.onlyTypes(effects, ['utxo.spend', 'utxo.output', 'utxo.fee'])"
        - "effect.one(effects, 'utxo.output')"
        - "effect.one(effects, 'utxo.fee')"
        - "effect.any(effects, 'utxo.output', {'address': coldStorageAddress})"
        - "bigint.lte(effect.amount(effects, 'utxo.output'), automaticLimit)"
        - "bigint.lte(effect.amount(effects, 'utxo.fee'), maximumFee)"
    - id: reviewed-sweep
      where:
        - "protocol == 'BTC'"
        - "sighash.all && !sighash.anyoneCanPay"
        - "effect.onlyTypes(effects, ['utxo.spend', 'utxo.output', 'utxo.fee'])"
        - "effect.one(effects, 'utxo.output')"
        - "effect.one(effects, 'utxo.fee')"
        - "effect.any(effects, 'utxo.output', {'address': coldStorageAddress})"
        - "bigint.gt(effect.amount(effects, 'utxo.output'), automaticLimit)"
        - "bigint.lte(effect.amount(effects, 'utxo.output'), reviewedLimit)"
        - "bigint.lte(effect.amount(effects, 'utxo.fee'), maximumFee)"
      approvals:
        threshold: 1
        approvers: [treasury-reviewer]
  deny: []
```

Replace the address, limits, and `publicKey64` with trusted production values. A payout, consolidation with change, or sweep to another vault should use another authority id and document.

See [Authorities](../authorities.md) for the document and policy schema, [CEL Functions](../cel-functions.md) for policy helpers, and [Composer](../composer.md) for response behavior.
