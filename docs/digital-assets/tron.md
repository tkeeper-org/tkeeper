# Tron Authorities

`tron.transaction` accepts unsigned transaction JSON. It requires a secp256k1 key and checks that the transaction owner matches the signing key. Build with `-Pkeeper.features=tron -Pkeeper.platforms=ecc`.

## Example: one recipient, at most 100 TRX

Tron amounts and `feeLimit` use [sun](https://developers.tron.network/docs/token-standards-trx); 100 TRX is 100,000,000 sun. This [authority](../../integration-tests/src/testFixtures/resources/authorities/tron/native-transfer.yaml) limits the recipient, amount, fee limit, and effect type:

```yaml
schemaVersion: verdict.authority/v1
id: test:tron/native-transfer
type: tron.transaction
version: 1.0.0
config: {}
policy:
  id: tron-native-transfer
  fallback: DENY
  variables:
    recipient: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
  allow:
    - id: small-transfer
      where:
        - "feeLimit <= 30000000"
        - "effect.onlyTypes(effects, ['native.transfer'])"
        - "effect.one(effects, 'native.transfer')"
        - "effect.all(effects, 'native.transfer', {'asset': 'trx', 'to': recipient})"
        - "bigint.gt(effect.amount(effects, 'native.transfer'), '0')"
        - "bigint.lte(effect.amount(effects, 'native.transfer'), '100000000')"
```

Build the unsigned JSON with the key's owner address, then compose:

```java
var command = Command.of("test:tron/native-transfer",
        new UnsignedTronTransaction(unsignedTronJson));
var signed = client.signature().compose(
        Sign.of(tronKeyId, command), SignedTronTransaction.class);
String transactionJson = signed.rawTransaction();
String transactionHash = signed.transactionHash();
```

The composer keeps the approved transaction body and adds the signature. The broadcaster submits `transactionJson`. With a `tweak`, derive the owner address from `central().getPublicKey(tronKeyId, tweak)`. [Composer](../signing-and-authorities/composer.md) describes the common response contract.
