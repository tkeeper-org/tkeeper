# Four Eye Control

Four-eye control can be unconditional at the key level or selected by an authority policy for a particular typed signing intent. In both cases, TKeeper requires the configured number of distinct approver signatures before continuing.

## Key policy shape

```json
{
  "fourEye": {
    "mode": "STRICT",
    "m": 2,
    "n": 3,
    "keys": [
      {
        "algorithm": "SECP256K1",
        "publicKey64": "..."
      },
      {
        "algorithm": "P256",
        "publicKey64": "..."
      },
      {
        "algorithm": "ED25519",
        "publicKey64": "..."
      }
    ]
  }
}
```

Rules:

- `mode` is `STRICT` or `LENIENT`; omitted values default to `STRICT`
- `m` must be at least `2`
- `m` cannot be greater than `n`
- `keys.size` must equal `n`
- duplicate approver keys are rejected
- approver public keys must decode under the declared algorithm
- approver algorithms must be present in the runtime artifact; ECC provides `SECP256K1`, `P256`, and `ED25519`, while the optional PQC platform adds `MLDSA44`, `MLDSA65`, and `MLDSA87`

`STRICT` preserves the original behavior: approvals are required for every operation protected by the key policy, including signing, decrypting, rotating, refreshing, and destroying a generation.

`LENIENT` protects key lifecycle changes: `ROTATE`, `REFRESH`, and generation destruction. Signing and decryption proceed without key-bound approvals. Initial `CREATE` has no stored key policy to enforce; a `fourEye` policy supplied during creation protects later operations. Authentication, permissions, authority policies, and audit checks still apply.

## Policy-driven approvals

An authority manifest can require approvals only when a particular allow rule matches. Approver public keys are declared once under `policy.approvers`; each rule selects a threshold and a set of approver ids:

```yaml
policy:
  id: payment-policy
  fallback: DENY
  approvers:
    operator-a:
      algorithm: SECP256K1
      publicKey64: "..."
    operator-b:
      algorithm: P256
      publicKey64: "..."
    compliance:
      algorithm: ED25519
      publicKey64: "..."
  allow:
    - id: approve-payment
      where:
        - "purpose == 'payment'"
      approvals:
        threshold: 2
        approvers: [operator-a, operator-b]
    - id: compliance-review
      where:
        - "purpose == 'payment'"
      approvals:
        threshold: 1
        approvers: [compliance]
```

If both rules match, both approval groups must be satisfied. Requirements from a key-level `fourEye` policy are cumulative with authority-policy requirements; one approval payload can carry proofs for every group.

An `ALLOW_WITH_REQUIREMENTS` fallback uses the same model:

```yaml
policy:
  id: guarded-fallback
  fallback: ALLOW_WITH_REQUIREMENTS
  approvers:
    operator:
      algorithm: ED25519
      publicKey64: "..."
  fallbackApprovals:
    threshold: 1
    approvers: [operator]
```

For an authority-policy challenge, TKeeper returns `APPROVAL_REQUIRED` with the `policyId`, rule or fallback `source`, and `threshold` for every required group. The public keys remain in the authority manifest. Sign the canonical request hash with enough keys from every group, attach all proofs to the same request, and resubmit it unchanged.

Policy-driven approvals apply to typed signing through the selected authority. Arbitrary signing does not evaluate an authority policy. The audit event retains the `ALLOW_WITH_REQUIREMENTS` decision and its requirements after successful approval.

## Approval model

Approvers sign a hash of the exact operation body. TKeeper verifies the submitted proofs before continuing to signing, DKG, destroy, or decrypt.

Approval payload:

```json
{
  "approvals": {
    "keeperId": 1,
    "nonce": "unique-nonce",
    "timestamp": 1760000000000,
    "proofs": [
      {
        "fingerprint": "...",
        "signature64": "..."
      }
    ]
  }
}
```

At the coordinator boundary, the nonce is one-time and is consumed only after enough signatures verify. Consumed nonces are retained for `keeper.nonce-ttl` (12 hours by default), so a coordinator restart does not reopen the replay window. The approval timestamp must not be in the future and must fit `keeper.approval.ttl`. Nonce retention must be strictly longer than the approval lifetime; physical FIFO cleanup can occur later.

Threshold protocol retries reuse the same approval. Non-coordinator peers therefore verify its signatures, approved request fields, and TTL without independently consuming the nonce. If the coordinator is compromised, it can replay an approval with those same fields only while it remains fresh; see the threat model.

The coordinator peer id in `approvals.keeperId` must match the peer coordinating the operation.

## Signature algorithms

| Approver key | Approval signature |
| --- | --- |
| `SECP256K1` | ECDSA |
| `P256` | ECDSA |
| `ED25519` | EdDSA |
| `MLDSA44` | ML-DSA |
| `MLDSA65` | ML-DSA |
| `MLDSA87` | ML-DSA |

The approver fingerprint is:

```text
base64(sha256(encoded-public-key))
```

## Building `hashForSigning`

### One format for key-bound and policy-bound approvals

Key-bound approval keys come from the selected generation's policy. Authority-policy groups come from matching allow rules or the fallback. TKeeper requires every applicable group before proceeding.

All approvers sign one `hashForSigning`. All proofs travel in one `approvals.proofs` array with one `keeperId`, nonce, and timestamp. Combined enforcement requires every key-bound and policy-bound group; it creates no second request or hash.

Policy-bound groups apply to typed `Sign` requests. Key-bound groups apply according to their mode:

| Key policy mode | Protected operations |
| --- | --- |
| `STRICT` | `Sign`, `ROTATE`, `REFRESH`, ECIES `Decrypt`, and `Destroy` |
| `LENIENT` | `ROTATE`, `REFRESH`, and `Destroy` |

Initial `CREATE` has no stored key policy. A `fourEye` policy carried by `CREATE` starts protecting the key after generation 1 becomes active.

A policy-only request with an empty proof list returns `APPROVAL_REQUIRED` and the required `policyId`, rule or fallback `source`, and `threshold`. The caller supplies the approval envelope and calculates the hash.

### Request transformation

Add this field to the exact operation request:

```json
{
  "approvals": {
    "keeperId": 1,
    "nonce": "018f-example-unique-nonce",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Build the hash preimage with this transformation:

1. Copy every operation field except the top-level `approvals` field.
2. Copy `approvals.keeperId`, `approvals.nonce`, and `approvals.timestamp` into the preimage root.
3. Leave `approvals.proofs` outside the preimage.
4. Recursively canonicalize the preimage and hash its UTF-8 bytes with SHA-256.
5. Sign the resulting 32 bytes with enough keys from every required group.
6. Add the proofs to the original request and submit it with the same operation fields, keeper id, nonce, and timestamp.

Each proof contains:

```text
fingerprint = base64(sha256(encoded-public-key))
signature64 = base64(signature-bytes)
```

ECDSA signatures use compact `r || s` bytes with an optional recovery-id byte. Ed25519 uses its 64-byte detached signature. ML-DSA uses the encoded detached signature for the declared parameter set.

The Java SDK models `Sign`, `Generate`, `Decrypt`, and `KeyDestroyReference` implement `Approvable`:

```java
var approvals = Approvals.template(
        coordinatorPeerId,
        UUID.randomUUID().toString(),
        Instant.now().toEpochMilli()
);
var request = Sign.builder(keyId, command)
        .approvals(approvals)
        .build();

byte[] hashForSigning = request.hashForSigning();
byte[] signatureBytes = approvalSigner.signDigest(hashForSigning);

request.addProof(new Approvals.Proof(
        approverFingerprint64,
        Base64.getEncoder().encodeToString(signatureBytes)
));
client.signature().sign(request);
```

`approvalSigner` denotes the application's HSM, wallet, or external approval service.

### Sign

The same request supports key-bound approvals, policy-bound approvals, or both:

```json
{
  "keyId": "payments-key",
  "command": {
    "type": "custom",
    "authorityId": "payments",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "purpose": "payment",
        "amount": "1000"
      }
    }
  },
  "approvals": {
    "keeperId": 1,
    "nonce": "018f-example-unique-nonce",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Hash preimage:

```json
{
  "keyId": "payments-key",
  "command": {
    "type": "custom",
    "authorityId": "payments",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "purpose": "payment",
        "amount": "1000"
      }
    }
  },
  "keeperId": 1,
  "nonce": "018f-example-unique-nonce",
  "timestamp": 1760000000000
}
```

Copy a non-null request `tweak` into the preimage root.

### DKG: `CREATE`, `ROTATE`, and `REFRESH`

`Generate.hashForSigning()` covers all three modes. The `mode` string belongs to the signed data, so a proof for one mode fails for the other two.

Example `ROTATE` request:

```json
{
  "keyId": "lifecycle-key",
  "algorithm": "SECP256K1",
  "authorities": [
    {"id": "arbitrary"}
  ],
  "mode": "ROTATE",
  "approvals": {
    "keeperId": 1,
    "nonce": "rotate-unique-nonce",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Hash preimage:

```json
{
  "keyId": "lifecycle-key",
  "algorithm": "SECP256K1",
  "authorities": [
    {"id": "arbitrary"}
  ],
  "mode": "ROTATE",
  "keeperId": 1,
  "nonce": "rotate-unique-nonce",
  "timestamp": 1760000000000
}
```

Optional request fields `policy` and `assetOwner` enter the preimage recursively. This binds approval to the resulting generation's authorities, policy, and owner.

| Mode | Approval source and result |
| --- | --- |
| `CREATE` | No previous generation supplies a key-bound group. The request's `policy` and `assetOwner` become generation 1 metadata. |
| `ROTATE` | The active generation's policy authorizes replacement. The request's optional `policy` and `assetOwner` become metadata for the new key material. |
| `REFRESH` | The active generation's policy authorizes a new generation with the same public key. The request's optional `policy` and `assetOwner` become its metadata. Material behavior depends on the algorithm and quorum mode. |

For Java SDK requests, pass `KeyGenMode.CREATE`, `KeyGenMode.ROTATE`, or `KeyGenMode.REFRESH` to `Generate.builder(...)`, attach `.approvals(approvals)`, and call `hashForSigning()` before adding proofs.

### ECIES decrypt

ECIES encryption uses public key material and carries no approvals. Decrypt uses the key-bound policy stored with the requested generation. An omitted `generation` selects the active generation and leaves `generation` out of the preimage.

Request:

```json
{
  "keyId": "ecies-key",
  "algorithm": "AES_GCM",
  "generation": 3,
  "ciphertext64": "AQIDBA==",
  "tweak": "invoice-42",
  "approvals": {
    "keeperId": 1,
    "nonce": "decrypt-unique-nonce",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Hash preimage:

```json
{
  "keyId": "ecies-key",
  "algorithm": "AES_GCM",
  "generation": 3,
  "ciphertext64": "AQIDBA==",
  "tweak": "invoice-42",
  "keeperId": 1,
  "nonce": "decrypt-unique-nonce",
  "timestamp": 1760000000000
}
```

The server resolves an omitted `algorithm` to `AES_GCM` and includes that value in the preimage. Clients should send `algorithm` explicitly. A non-null `tweak` and an explicit `generation` enter the preimage.

For the Java SDK, build `Decrypt` with `.generation(...)`, `.tweak(...)`, and `.approvals(approvals)`, then call `hashForSigning()`.

### Destroy

Destroy uses the key-bound policy stored with the target generation. Both `STRICT` and `LENIENT` protect this operation.

Request:

```json
{
  "keyId": "lifecycle-key",
  "generation": 1,
  "approvals": {
    "keeperId": 1,
    "nonce": "destroy-unique-nonce",
    "timestamp": 1760000000000,
    "proofs": []
  }
}
```

Hash preimage:

```json
{
  "keyId": "lifecycle-key",
  "generation": 1,
  "keeperId": 1,
  "nonce": "destroy-unique-nonce",
  "timestamp": 1760000000000
}
```

Java SDK clients use `new KeyDestroyReference(keyId, generation, approvals)`, call `hashForSigning()`, add proofs, and pass the request to `client.destroy().destroy(request)`.

### Canonical encoding

Canonicalization rules:

- serialize compact UTF-8 JSON with no insignificant whitespace
- omit fields whose value is `null`
- sort JSON object field names lexicographically at every object level
- sort map entries by key
- preserve array order
- canonicalize objects inside arrays recursively
- preserve scalar types and string bytes, including Base64 text, enum names, nonce, and tweak

```text
hashForSigning = SHA-256(UTF-8(canonical-json))
```

Feed those 32 bytes directly to the approver algorithm. Hexadecimal and Base64 encodings serve display and transport. ECDSA consumes the supplied digest; Ed25519 and ML-DSA consume the 32 bytes as their message.

Canonical Sign vector:

```json
{"command":{"artifact":{"hash":"SHA256","scheme":"ECDSA","typed":{"amount":"1000","purpose":"payment"}},"authorityId":"payments","type":"custom"},"keeperId":1,"keyId":"payments-key","nonce":"018f-example-unique-nonce","timestamp":1760000000000}
```

Expected SHA-256: `ad0a5caa1cf84dcfb4b0012ac5af306ebb8938b1cafe4f0ab0d4e6232b135e9b`.

## Security notes

- Four-eye approvals do not replace TKeeper authentication or permissions.
- Approver keys should be stored separately from TKeeper peers.
- Any change to the approved request body requires new approvals.
- Approval signatures are only as trustworthy as approver key custody.
- Approval tooling should render the canonical operation from the signed fields. A trusted human summary that is not bound to the approval hash can mislead the approver.
- Nonce uniqueness prevents approval reuse inside TKeeper; downstream replay rules are still required for the resulting cryptographic proof.

## Common failures

### Approvals fail after changing the request

Create a new approval for the exact request body.

### Duplicate approver keys fail

`n` is the number of distinct approvers.

### Approval nonce is rejected on second use

Approval nonces are one-time.
