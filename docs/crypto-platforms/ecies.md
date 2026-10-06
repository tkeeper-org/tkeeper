# ECIES

ECIES encrypts data for a TKeeper key and decrypts it under the key's access controls. It combines an ElGamal-style key encapsulation mechanism with an authenticated payload cipher.

Encryption uses only the public key and needs no peer participation. In `mono`, decryption uses the local private key. In `threshold`, a quorum supplies partial decrypts; the coordinator checks each DLEQ proof before combining the result. Threshold decryption does not reconstruct the private key.

Build with it:

```bash
./gradlew shadowJar -Pkeeper.features=ecies -Pkeeper.platforms=ecc
```

Required permissions:

```text
tkeeper.key.{keyId}.encrypt
tkeeper.key.{keyId}.decrypt
```

Encrypt:

```http
POST /v1/keeper/ecies/encrypt
```

Body:

```json
{
  "keyId": "ecies-key",
  "algorithm": "AES_GCM",
  "plaintext64": "aGVsbG8=",
  "tweak": "optional"
}
```

Response:

```json
{
  "ciphertext64": "...",
  "generation": 1
}
```

Decrypt:

```http
POST /v1/keeper/ecies/decrypt
```

Body:

```json
{
  "keyId": "ecies-key",
  "algorithm": "AES_GCM",
  "generation": 1,
  "ciphertext64": "...",
  "tweak": "optional",
  "approvals": {
    "keeperId": 1,
    "nonce": "unique-nonce",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Response:

```json
{
  "plaintext64": "aGVsbG8=",
  "imposters": []
}
```

Algorithms:

```text
AES_GCM
CHACHA20_POLY1305
```

Supported curves:

```text
SECP256K1
P256
```

Decrypt requests can require four-eye approvals under key policy. The approval hash binds the decrypt request fields, including key id, algorithm, ciphertext, generation, tweak, nonce, and timestamp.

`imposters` contains peers that returned invalid partial decrypt proofs. It is only meaningful in threshold mode. Mono decrypt returns an empty list.

Decryption can succeed after rejecting invalid contributions if enough valid partial decrypts remain.

## Common problems

### ECIES endpoints are missing

Rebuild with `-Pkeeper.features=ecies -Pkeeper.platforms=ecc`.

### `INVALID_CIPHERTEXT`

The ciphertext is malformed, from another key, or from another tweak/generation.

### `NOT_ENOUGH_HONEST_CLIENTS`

Too many peers were unavailable or returned invalid partial decrypt proofs.
