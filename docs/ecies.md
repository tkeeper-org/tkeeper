# ECIES

ECIES lives in `feature-ecies`.

It uses an ElGamal-style KEM over the key curve plus an AEAD payload cipher.

Encryption uses the public key, so it does not need peer participation in either quorum mode.

In `mono` mode, decrypt is local. TKeeper reads the active private key material, applies the optional tweak, unwraps the KEM secret, and decrypts the payload.

In `threshold` mode, decrypt needs a quorum. Each peer returns a partial decrypt with a DLEQ proof. The coordinator verifies each proof against the ciphertext point, the peer public share, and the partial decrypt before combining the plaintext.

In threshold mode the private key is never reconstructed.

Build with it:

```bash
./gradlew shadowJar -Pkeeper.features=ecies
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

Decrypt requests can carry four eye approvals. The approval hash binds the decrypt request fields, including key id, algorithm, ciphertext, generation, tweak, nonce, and timestamp.

`imposters` contains peers that returned invalid partial decrypt proofs. It is only meaningful in threshold mode. Mono decrypt returns an empty list.

If quorum is still honest, threshold decrypt can succeed and report the bad peers.

## Frequent Problems

### ECIES endpoints are missing

Rebuild with `feature-ecies`.

### `INVALID_CIPHERTEXT`

The ciphertext is malformed, from another key, or from another tweak/generation.

### `NOT_ENOUGH_HONEST_CLIENTS`

Too many peers were unavailable or returned invalid partial decrypt proofs.
