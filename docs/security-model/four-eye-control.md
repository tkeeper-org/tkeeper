# Four Eye Control

Four-eye control can be unconditional at the key level or selected by an authority policy for a particular typed signing intent. TKeeper requires the configured number of distinct approver proofs before continuing. Both support ordinary signatures and WebAuthn assertions through pinned [Approvers registry refs](../api-reference/approvers.md#pin-a-registered-approver-in-a-policy).

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
- `m` must be at least `1`; `1 of 1` and `1 of n` require one valid proof from a configured approver
- `m` cannot be greater than `n`
- `keys.size` must equal `n`
- duplicate approver keys are rejected
- approver public keys must decode under the declared algorithm
- approver algorithms must be present in the runtime artifact; ECC provides `SECP256K1`, `P256`, and `ED25519`, while the optional PQC platform adds `MLDSA44`, `MLDSA65`, and `MLDSA87`

An entry may instead be `{"ref":"alice@sha256:<digest>"}`. Use the complete ref returned by
registration. References and inline entries can coexist in a group; mixed `ref` and inline fields
in one entry are rejected. Duplicate-key checks run after resolution. The immutable descriptor
selects SIGNATURE or WEBAUTHN, and a WebAuthn ref cannot be approved by a raw signature.

`STRICT` preserves the original behavior: approvals are required for every operation protected by the key policy, including signing, decrypting, rotating, refreshing, and destroying a generation.

`LENIENT` protects key lifecycle changes: `ROTATE`, `REFRESH`, and generation destruction. Signing and decryption proceed without key-bound approvals. Initial `CREATE` has no stored key policy to enforce; a `fourEye` policy supplied during creation protects later operations. Authentication, permissions, authority policies, and audit checks still apply.

## Policy-driven approvals

An authority manifest can require approvals only when a particular allow rule matches. Approvers are declared once under `policy.approvers`; each rule selects a threshold and a set of local aliases:

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

Replace any inline entry above with `ref: "alice@sha256:<digest>"` to pin a registered
SIGNATURE or WEBAUTHN credential. New inline entries can supply `id`; legacy immutable
artifacts without it use their map alias. All declared refs, including reserves, must resolve on
each participant before generation activation. Authority metadata never selects a dynamic group.

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

For an authority-policy challenge, TKeeper returns `APPROVAL_REQUIRED` with the `policyId`, rule or fallback `source`, and `threshold` for every required group. Approver descriptors come from inline manifest entries or their pinned registry refs. Collect enough signature or WebAuthn proofs for every group, attach them to the same request, and resubmit it unchanged.

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

At the coordinator boundary, the nonce is one-time and is consumed only after every required
group has enough valid proofs. Consumed nonces are retained for `keeper.nonce-ttl` (12 hours
by default), so a coordinator restart does not reopen the replay window. The approval timestamp
must not be in the future and must fit `keeper.approval.ttl`. Nonce retention must be strictly
longer than the approval lifetime; physical FIFO cleanup can occur later.

Once the operation's approval requirements have been collected, responses include
`X-EXPIRES-AT` on success and approval failure. It is the original approval deadline in Unix
seconds: `(approvals.timestamp + keeper.approval.ttl) / 1000`, truncated to whole seconds.
Repeated preparation or a corrected proof does not renew that window. An expired envelope
needs a fresh nonce, timestamp and proofs. See [approval deadlines](../api-reference/configuration.md#approval-deadlines).

Threshold protocol retries reuse the same approval. Non-coordinator peers therefore verify its signatures, approved request fields, and TTL without independently consuming the nonce. If the coordinator is compromised, it can replay an approval with those same fields only while it remains fresh; see the threat model.

The coordinator peer id in `approvals.keeperId` must match the peer coordinating the operation.

## WebAuthn approvals

A key-policy entry with `webAuthn` accepts WebAuthn assertions only. An entry without it accepts ordinary signatures only, even when the same P-256 public key produces a valid WebAuthn assertion. No automatic fallback or method substitution is allowed.

```json
{
  "algorithm": "P256",
  "publicKey64": "<standard base64 of the P256 public key>",
  "webAuthn": {
    "credentialId": "<unpadded base64url>",
    "rpId": "approvals.example.com",
    "origins": ["https://approvals.example.com"],
    "userHandle": "<unpadded base64url>",
    "backupEligible": false
  }
}
```

Use the complete ref returned by the [Approvers registration API](../api-reference/approvers.md#register-webauthn-from-a-hub) in a key or authority policy. Existing inline WebAuthn key policies remain supported; import their public key, credential id, user handle, and backup eligibility from a trusted registration flow. Changing pinned parameters on an existing key requires REFRESH/ROTATE approved under its current policy. Duplicate public keys are rejected across both methods and both representations; duplicate `(rpId, credentialId)` pairs are also rejected.

The initial WebAuthn algorithm is ES256/P-256. User presence and user verification are mandatory. Origins match exactly, including port, and must use HTTPS; explicitly configured HTTP localhost origins are allowed for development. Subdomain matching, iframe/cross-origin ceremonies, and AppID compatibility are disabled. [Yubico server verification](https://developers.yubico.com/java-webauthn-server/) implements the WebAuthn assertion checks.

`clientDataJSON` must contain UTF-8 JSON; a leading UTF-8 BOM is accepted. Duplicate object fields, trailing JSON values, invalid encodings, and oversized assertion fields are rejected before assertion signature verification. Both JSON and internal MessagePack reject null entries in proof lists.

To collect approvals:

1. Construct the operation with `approvals.keeperId`, a fresh nonce, timestamp, and an empty proofs list.
2. Send `{ "type": "sign", "operation": <request> }` to `POST /v1/keeper/approvals/prepare`. Core types are `sign`, `dkg`, and `destroy`; ECIES adds `decrypt`. The caller needs primary authentication and permission for the enclosed operation. Preparation evaluates current policies without admitting the operation or consuming its nonce.
3. Use the returned `webAuthn[].publicKey` options with `navigator.credentials.get`. Decode the base64url challenge and credential ids into byte arrays, or use `PublicKeyCredential.parseRequestOptionsFromJSON` where supported. `userVerification` is `required`.
4. Attach the browser's standard assertion JSON with its matching credential id and the unchanged signed `binding`:

```javascript
const proof = {
  fingerprint: approverFingerprint64,
  binding: prepared.binding,
  credential: assertion.toJSON()
};
```

5. Add any ordinary signature proofs and submit the original operation. Adding proofs does not change `hashForSigning`. Both methods share the same approval envelope and cumulative group enforcement. A key counts once within a group, regardless of repeated proofs. Each entry requires the method selected by its descriptor; an authority group can contain both signature and WebAuthn registry refs.

Preparation requires primary authentication (for example JWT) and the enclosed operation's permission. A one-time mandate cannot authorize the preparation wrapper. Preparation consumes neither an approval nonce nor a mandate. After collecting proofs, execute the operation with either JWT or an already issued mandate. Failed approval checks leave the mandate available for a corrected submission; successful admission consumes it through the existing mandate flow.

WebAuthn uses the approval operation providers to resolve the operation type, permission, and external/internal representations. It does not require `HasGrantBinding` or registration as a mandate operation. JWT and mandate authentication retain their existing authorization checks; FourEye verifies approvals independently in both cases.

The server creates a random 32-byte challenge and signs a binding containing the operation hash/type, coordinator, selected source generation, current approval requirements, and validity window. Its signature covers the canonical JSON with domain `TKEEPER_WEBAUTHN_CHALLENGE_V1`, payload, and signature metadata with an empty `signature64`. Peers verify the receipt against the authenticated coordinator's pinned integrity key and independently verify the assertion. Its expiry cannot exceed `approvals.timestamp + keeper.approval.ttl`; changed operations, generations, policies, or receipt fields fail verification.

Verification has no mutable credential state. Zero counters and repeated internal checks are supported; signature counters are not used for clone detection. The existing durable, atomic approval nonce admission prevents external replay, including concurrent submissions and coordinator restarts. An incomplete quorum does not consume the nonce. Internal protocol retries retain the existing approval replay window described above. Integrity-key changes require fresh preparation when peers no longer pin the receipt's signing key. Roll out this format to all participating peers before enabling a WebAuthn policy.

Java SDK: `client.approvals().prepare(new PrepareApprovals(type, operationJson))` returns the browser options and binding. Both `SignatureProof(fingerprint, signature64)` and `WebAuthnProof(fingerprint, binding, assertionJson)` implement `Proof`. Use `new WebAuthnProof(fingerprint, prepared.binding(), assertionJson)` to attach an assertion. SDK callers constructing the former `Approvals.Proof` record must switch to `new SignatureProof(fingerprint, signature64)`; the signature JSON format is unchanged.

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

request.addProof(new SignatureProof(
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
