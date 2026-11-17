# Trusted dealer import

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
  "authorities": ["oci://registry.example/edict/authorities/payments-small@sha256:..."]
}
```

`authorities` is a JSON array of digest-pinned OCI references. Keeper reads each authority ID from its document and stores the resolved ID in key metadata.

`value64` is base64 of the raw private key bytes. For Ed25519, import the standard seed bytes.

Required permission:

```text
tkeeper.storage.write
```

The imported key uses the same signing, verification, authority, and policy controls as a key created in TKeeper.

Response:

```http
204 No Content
```

Use trusted dealer only for bringing an existing key into TKeeper. For new keys, prefer DKG.

Import does not erase the dealer's copy, backups, or handling history. Threshold custody protects later use by TKeeper peers, but it cannot make the key equivalent to one that was never reconstructed. Rotate after migration when continuity of the imported public key is not required.

## Interrupted threshold imports

The coordinator durably stores a signed import plan before writing any shares. It records commit after every member has activated its share. The plan contains the import identity, key generations, members, and request hash. Private material stays in key storage.

After a coordinator restart or an incomplete cleanup, repeat the request on the same coordinator. Recovery compensates an attempt without commit before a new import starts. A committed attempt is finalized without deleting its key. Repeating the same request after recovery of a committed attempt succeeds without importing it again. If a member is unavailable, the plan remains stored for another retry.

Recipients retain signed commit and revert outcomes so delayed messages cannot recreate an aborted import. Expiration prevents activating an old pending import. Its authenticated owner can still complete cleanup or finalization after expiration. Compensation checks the generation's import owner and captured key state before removing material. Active shares remain usable under their normal authorization and policy checks while finalization is pending.

## Common problems

### Imported key exists but signing fails

Check the declared algorithm, attached authority, caller permissions, and peer state. Compare the public key with the expected imported key. If inventory reports tampering or peers disagree on the generation, stop and investigate before retrying.

### Wrong algorithm

The raw private key must match the declared algorithm and its expected encoding.
