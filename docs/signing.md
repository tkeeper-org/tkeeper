# Signing

Signing runs in the Keeper's quorum mode.

The coordinator materializes the command into bytes, checks the key controls, then chooses the signing manager for the key curve, signature scheme, and quorum mode.

In `mono` mode, TKeeper signs locally with the stored private key material. Controls still run before the signature is produced.

In `threshold` mode, the private key is never reconstructed. The coordinator chooses a quorum and starts the matching threshold signing protocol.

For threshold mode TKeeper uses:

- FROST for EdDSA, Schnorr, BIP340, and Taproot signatures
- GG20 for ECDSA signatures

The command decides the signature scheme and hash. The top-level sign request does not carry `hash` or `algorithm`.

Sign:

```http
POST /v2/keeper/sign
```

Verify:

```http
POST /v2/keeper/sign/verify
```

Required permissions:

```text
tkeeper.key.{keyId}.sign
tkeeper.key.{keyId}.verify
```

## Commands

Arbitrary command:

```json
{
  "keyId": "eth-cold-storage",
  "command": {
    "type": "arbitrary",
    "authorityId": "arbitrary",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "data64": "aGVsbG8="
    }
  }
}
```

Typed command:

```json
{
  "keyId": "payments-key",
  "command": {
    "type": "custom",
    "authorityId": "payments-small",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "amount": 100,
        "currency": "USD"
      }
    }
  }
}
```

EVM command needs the `authority-evm` build feature:

```json
{
  "keyId": "evm-key",
  "command": {
    "type": "evm.transaction",
    "authorityId": "evm-mainnet-erc20-usdc",
    "artifact": {
      "message64": "..."
    }
  }
}
```

Bitcoin command needs the `authority-bitcoin` build feature. X.509 command needs `authority-x509`.

TKeeper builds the bytes to sign from the command. For EVM, Bitcoin, X.509, and typed authorities, the request is parsed into an intent, effects are extracted, policy is evaluated, and only then the final signing bytes are produced.

## Schemes

| Scheme | Mono | Threshold | Notes |
| --- | --- | --- |
| `ECDSA` | local ECDSA | GG20 | secp256k1 or P-256 |
| `SCHNORR` | not supported | FROST | secp256k1 or P-256 |
| `BIP340` | local BIP340 | FROST | secp256k1 Bitcoin Schnorr |
| `TAPROOT` | local Taproot key-path | FROST | secp256k1 Taproot key-path |
| `EdDSA` | local EdDSA | FROST | Ed25519 |

Hash methods:

| Hash | Notes |
| --- | --- |
| `NONE` | sign bytes as-is |
| `SHA256` | hash before signing |
| `SHA512` | hash before signing |
| `KECCAK256` | hash before signing |

Sign response:

```json
{
  "code": "SUCCESS",
  "type": "ECDSA",
  "signature64": "...",
  "generation": 1,
  "imposters": []
}
```

`imposters` is meaningful for threshold protocols. Mono signatures return an empty list.

Verify response:

```json
{ "valid": true }
```

`generation` is optional on verify. If omitted, TKeeper uses the active generation.

## Authority Flow

Every sign request uses a command with an `authorityId`.

If the key has `arbitrary` authority, TKeeper signs raw data from the command. If the key has concrete authorities, TKeeper loads the digest-pinned OCI authority, builds the intent for the command, evaluates policy, and only then signs in the current quorum mode.

`arbitrary` cannot be mixed with other authorities on the same key.

## Frequent Problems

### Verify returns false

Check that `command`, `tweak`, `generation`, and `signature64` match the original sign request. For arbitrary commands, also check `hash` and `scheme` inside the command artifact.

### Authority rejects the command

The key authority does not allow this command. For non-arbitrary keys, check the authority id and the OCI policy.

### No manager for scheme and curve

The key curve or quorum mode does not support the requested signature scheme. For example, Ed25519 only supports `EdDSA`, and mono secp256k1 does not support `SCHNORR`.
