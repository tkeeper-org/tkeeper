# Trusted Dealer Import

Trusted dealer imports an existing private key into the current quorum mode.

In mono mode, TKeeper stores the full key locally.

In threshold mode, TKeeper splits the key into peer shares and distributes them to the cluster.

Endpoint:

```http
POST /v2/keeper/storage/store
```

Body:

```json
{
  "keyId": "imported-secp256k1",
  "algorithm": "SECP256K1",
  "value64": "base64-raw-private-key",
  "authorities": [
    {
      "id": "payments-small",
      "oci": "oci://registry.example/verdict/authorities/payments-small@sha256:..."
    }
  ]
}
```

`authorities` is a JSON array of key authorities.

`value64` is base64 of the raw private key bytes. For Ed25519, import the standard seed bytes.

Required permission:

```text
tkeeper.storage.write
```

The imported key uses the same signing, verification, authority, and policy controls as a key created in TKeeper.

Response:

```http
200 OK
```

Use trusted dealer only for bringing an existing key into TKeeper. For new keys, prefer DKG.

Import does not erase the dealer's copy, backups, or handling history. Threshold custody protects later use by TKeeper peers, but it cannot make the key equivalent to one that was never reconstructed. Rotate after migration when continuity of the imported public key is not required.

## Common problems

### Imported key exists but signing fails

Check the declared algorithm, attached authority, caller permissions, and peer state. Compare the public key with the expected imported key. If inventory reports tampering or peers disagree on the generation, stop and investigate before retrying.

### Wrong algorithm

The raw private key must match the declared algorithm and its expected encoding.
