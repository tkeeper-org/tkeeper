# Solana Authorities

`solana.transaction` accepts an unsigned transaction in Base64 and requires an Ed25519 key. TKeeper checks that the signing key is a required signer of the message. Build with `-Pkeeper.features=solana -Pkeeper.platforms=ecc`.

## Example: one native transfer

This [authority](../../integration-tests/src/testFixtures/resources/authorities/solana/native-transfer.yaml) permits one required signer and a transfer of at most 100 [lamports](https://solana.com/docs/references/terminology) to one recipient:

```yaml
schemaVersion: verdict.authority/v1
id: test:solana/native-transfer
type: solana.transaction
version: 1.0.0
config: {}
policy:
  id: solana-native-transfer
  fallback: DENY
  variables:
    recipient: "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR"
  allow:
    - id: small-transfer
      where:
        - "requiredSignatures == 1"
        - "effect.onlyTypes(effects, ['native.transfer'])"
        - "effect.one(effects, 'native.transfer')"
        - "effect.all(effects, 'native.transfer', {'asset': 'sol', 'to': recipient})"
        - "bigint.gt(effect.amount(effects, 'native.transfer'), '0')"
        - "bigint.lte(effect.amount(effects, 'native.transfer'), '100')"
```

Build the message with the TKeeper key as a required signer, then compose:

```java
var command = Command.of("test:solana/native-transfer",
        new UnsignedSolanaTransaction(unsignedSolana64));
var signed = client.signature().compose(
        Sign.of(solanaKeyId, command), SignedSolanaTransaction.class);
if (!signed.complete()) throw new IllegalStateException("Missing signatures");
String transaction64 = signed.rawTransaction();
String transactionHash = signed.transactionHash();
```

For policies that allow multiple signers, the composer can return a partial transaction with `complete: false` and no hash. With a `tweak`, build the message using `central().getPublicKey(solanaKeyId, tweak)`. The caller submits the complete transaction. [Composer](../signing-and-authorities/composer.md) describes the common response contract.
