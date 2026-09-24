# XRP Authorities

`xrp.transaction` accepts an unsigned transaction in hex. It supports secp256k1 and Ed25519 keys. TKeeper checks both `Account` and `SigningPubKey` against the signing key. Build with `-Pkeeper.features=xrp -Pkeeper.platforms=ecc`.

## Example: bounded native payment

This [authority](../../integration-tests/src/testFixtures/resources/authorities/xrp/native-payment.yaml) permits one recipient, at most 100 [drops](https://xrpl.org/docs/introduction/transactions-and-requests), a fee of at most 12 drops, and a ledger expiry:

```yaml
schemaVersion: verdict.authority/v1
id: test:xrp/native-payment
type: xrp.transaction
version: 1.0.0
config: {}
policy:
  id: xrp-native-payment
  fallback: DENY
  variables:
    recipient: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
  allow:
    - id: small-payment
      where:
        - "type == 'payment'"
        - "lastLedgerSequence != null"
        - "bigint.lte(fee, '12')"
        - "effect.onlyTypes(effects, ['native.transfer'])"
        - "effect.one(effects, 'native.transfer')"
        - "effect.all(effects, 'native.transfer', {'asset': 'xrp', 'to': recipient, 'destinationTag': 0})"
        - "bigint.gt(effect.amount(effects, 'native.transfer'), '0')"
        - "bigint.lte(effect.amount(effects, 'native.transfer'), '100')"
```

Set `Account` and `SigningPubKey` from the TKeeper public key before serializing the unsigned transaction:

```java
var command = Command.of("test:xrp/native-payment",
        new UnsignedXrpTransaction(unsignedXrpHex));
var signed = client.signature().compose(
        Sign.of(xrpKeyId, command), SignedXrpTransaction.class);
String transactionHex = signed.rawTransaction();
String transactionHash = signed.transactionHash();
```

With a `tweak`, derive those fields from `central().getPublicKey(xrpKeyId, tweak)`. The caller submits the signed hex and tracks its ledger result. [Composer](../signing-and-authorities/composer.md) describes the common response contract.
