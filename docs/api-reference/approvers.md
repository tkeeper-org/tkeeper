# Approvers registry

Approvers is part of the TKeeper core. Every peer stores immutable credential versions in its
own database. The API registers `SIGNATURE` credentials with installed signature providers
(including PQC where installed) and `WEBAUTHN` credentials through a verified ES256 ceremony.
Requests can enter through any initialized, unsealed peer, including non-coordinators.

| Operation | Permission |
| --- | --- |
| `POST /v1/keeper/approvers` | `tkeeper.approvers.register` |
| `POST /v1/keeper/approvers/webauthn/registration/options` | `tkeeper.approvers.register` |
| `POST /v1/keeper/approvers/webauthn/registration/finish` | primary authentication and registration invitation; no additional permission |
| `GET /v1/keeper/approvers` | `tkeeper.approvers.read` |
| `GET /v1/keeper/approvers/{ref}` | `tkeeper.approvers.read` |
| `PUT /v1/keeper/approvers/{ref}/metadata` | `tkeeper.approvers.metadata` |

These permissions are independent. Registration returns the registered record, but does not
grant access to list or read other versions. Metadata updates return the updated record.
Primary authentication is required for every endpoint. In production, send a JWT in
`X-JWT-TOKEN`, including on WebAuthn finish. Finish also requires its single-use invitation.
Operation mandates cannot authorize registry calls or replace that JWT.

## Register a credential

```json
{
  "id": "alice",
  "credential": {
    "type": "SIGNATURE",
    "algorithm": "ED25519",
    "publicKey64": "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="
  },
  "metadata": {"team": "treasury", "displayName": "Alice"}
}
```

`id` is case-sensitive and matches `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. The server validates
and re-encodes the public key with its algorithm provider, then computes:

```text
digest = SHA256(UTF8("TKEEPER_APPROVER_V1") || 0x00 || canonicalJson(normalizedCredential))
ref = id || "@sha256:" || lowercaseHex(digest)
```

The normalized credential contains `version: 1`, `type`, canonical `algorithm`, and `publicKey64`.
Canonical JSON sorts object keys recursively. The example's ref is
`alice@sha256:65c61b68b633767fa1f7666832f3967a8d4d83b8fdd1ac4a62f3b127e985ef1f`.
Metadata, id, and timestamps are excluded from the digest.

A key identity combines the canonical algorithm with the normalized public-key fingerprint;
identical byte encodings on different curves represent distinct keys.

A new version returns `201`; an identical version under the same id returns `200` with its
existing metadata. The same normalized key under another id returns `409`. A different key
under the same id creates another version and preserves every previous version. No descriptor
update or deletion endpoint is provided.

Registration does not make the credential an authorized approver. A key's FourEye policy or
an OCI authority policy must explicitly pin its complete `ref`. Both SIGNATURE and WEBAUTHN
descriptors are supported. Existing inline FourEye policies keep their current contract.

## Pin a registered approver in a policy

Use `{"ref":"alice@sha256:<digest>"}` as an element of `fourEye.keys`, or as a value under
`policy.approvers` in an authority manifest. Replace the placeholder with the actual ref returned
by registration. Authority approval rules continue to select local aliases:

```yaml
policy:
  id: payments
  fallback: ALLOW_WITH_REQUIREMENTS
  approvers:
    treasury:
      ref: "alice@sha256:<digest>"
  fallbackApprovals:
    threshold: 1
    approvers: [treasury]
```

Every participant resolves all target refs before CREATE/REFRESH/ROTATE, including unused
authority approvers reserved for later rules. Resolution reads the local replicated registry and
verifies descriptor integrity and digest. Missing descriptors fail closed. There is no lookup by
bare id, latest, URL, metadata, or a key supplied in a proof. Duplicate keys are rejected after
resolving inline entries and refs together. A WebAuthn ref accepts WebAuthn assertions only.

Authority groups use `threshold: m` and a list of `n` approver aliases. Key-bound policies use
`fourEye.m`, `fourEye.n`, and `fourEye.keys`, with `1 <= m <= n <= 256`. A threshold of `1`
requires one valid proof from any of the configured approvers, including a `1 of 1` policy:

```json
{
  "fourEye": {
    "mode": "LENIENT",
    "m": 2,
    "n": 3,
    "keys": [
      {"ref": "alice@sha256:<digest>"},
      {"ref": "bob@sha256:<digest>"},
      {"ref": "carol@sha256:<digest>"}
    ]
  }
}
```

`LENIENT` requires these approvals for ROTATE, REFRESH, and generation destruction. `STRICT`
also protects signing and decryption. Initial CREATE has no existing key policy; a policy supplied
during CREATE protects subsequent operations. Key-bound and authority approval groups are cumulative.

The original policy retains the literal ref in its signing hash. A new version or metadata update
does not change an existing policy. Changing a pinned ref requires REFRESH/ROTATE authorized
by the current policy; historical generations retain their exact refs. Normal approval verification
needs no registry writer or registry mutation lock. Recovery and MONO promotion transfer the
registry before the affected keys are made usable.

## Register WebAuthn from a hub

Configure the same RP on every peer. The origins identify the approval hub frontend, independently
of the Keeper API hostname. RP parameters are never inferred from Host or Forwarded headers.

```hocon
keeper.webauthn {
  enabled = true
  rp-id = "approvals.example.com"
  rp-name = "Keeper approvals"
  origins = ["https://approvals.example.com"]
  registration-ttl = 5m
}
```

Registration is disabled by default and requires the P256 platform. HTTPS origins must be exact
origins under the RP ID: no wildcard, path, credentials, query or fragment. Explicit HTTP localhost
configuration is allowed for development. Origins are pinned in sorted order in each descriptor.

Send `{"id":"alice","metadata":{"team":"treasury"}}` to the options endpoint. Its response is
`{registrationId, invitation, expiresAt, publicKey}`. `publicKey` is standard JSON creation options: binary fields
are unpadded Base64url. Convert challenge, user.id and excludeCredentials ids to browser buffers
before `navigator.credentials.create({publicKey})`, or use the browser's JSON options parser.
The server supplies a fresh 32-byte challenge and random user handle, requests ES256 and required
user verification, and includes known credentials of this id/RP in excludeCredentials.
The response includes `X-EXPIRES-AT`, the session deadline as a Unix timestamp in
whole seconds; the JSON `expiresAt` field remains in milliseconds.

Send the resulting browser credential JSON to finish:

```json
{"invitation":"<returned invitation token>","credential":{
  "id":"<base64url>","rawId":"<same base64url>","type":"public-key",
  "response":{"clientDataJSON":"<base64url>","attestationObject":"<base64url>","transports":["usb"]},
  "clientExtensionResults":{}
}}
```

Standard browser-derived response fields and the requested `credProps` extension are accepted.
The public key and credential ID used by Keeper come from verified attestation data, with an
explicit check that the attested ID equals id/rawId. There is no client-supplied descriptor override.
UV/UP, challenge, exact origin, RP hash, COSE algorithm/key and attestation are checked by the
Yubico verifier. Private/unknown COSE key parameters, malformed encodings, duplicate JSON/CBOR
keys, cross-origin responses and unrequested client extensions are rejected.

The registrar starts the ceremony with `tkeeper.approvers.register`, then passes the invitation
and browser options to the intended credential holder. The holder sends their own valid JWT
and the invitation to finish, possibly through another peer. No registry permission or match
with the registrar's JWT subject is required. The writer independently checks a forwarded JWT.
The session pins the registrar, target id,
metadata, RP, origins, algorithm and deadline. The invitation is 32 random bytes in canonical
unpadded Base64url. Its domain-separated SHA-256 hash is the public `registrationId`; that id
cannot authorize finish. The mirrored session contains the hash, not the invitation secret.
Keeper returns a token, leaving links and delivery to external management.

A session defaults to five minutes (maximum ten); each registrar can have eight unfinished
sessions and the writer retains at most 256 unexpired sessions. Capacity exhaustion returns 429.

Finish returns `201` for a new version and `200` for an identical successful retry within the
session deadline. A different
response for a completed session is rejected. Session consumption, the descriptor, uniqueness
indexes, initial counter/backup observations and replication outbox commit in one transaction.
Completed sessions and records survive writer restarts. Runtime observations are stored separately
from the descriptor and do not change the ref. Counters are never reduced by registration retries.
Every peer validates the invitation and reserves its one response/ref before signing PREPARE.
Invalid tokens or ceremony responses do not consume a valid invitation. Live sessions and durable
consumption reservations transfer through recovery and promotion. Treat the invitation as a bearer
secret: any authenticated holder can enroll a credential for its pinned id. The recipient's
JWT does not change that id or establish that the registrar intended this particular holder.
Registration still grants no approval rights until a policy explicitly pins the resulting ref.

Deploy this contract to all peers and update SDK callers together. Earlier unfinished sessions
must be restarted; finish now accepts `invitation` instead of `registrationId`.

The deadline limits new WebAuthn confirmations and PREPARE receipts. An already complete
all-member confirmation remains valid for delivery after that deadline. Partial signed
reservations keep their key, credential and metadata locks until coordinated settlement;
TTL does not release those locks or permit a conflicting registration.

The WebAuthn descriptor contains version/type, credentialId, canonical public ES256 COSE key,
rpId, sorted origins, `userVerification: REQUIRED`, userHandle and backupEligible. Every field
enters its digest. `(rpId, credentialId)` is unique; the normalized P256 key shares its owner index
with SIGNATURE keys, so switching formats cannot acquire another owner's key.

## Read and filter

Pass the complete URL-encoded ref in path parameters, for example `alice%40sha256%3A<digest>`.
Bare ids and shortened or uppercase hashes are invalid.

The list response is `{items, nextCursor}`. Supported filters are `id`, `type=SIGNATURE|WEBAUTHN`,
and exact string matches such as `metadata.team=treasury`. Multiple metadata filters combine
with AND. URL-encode both parameter names and values. Every matching version is returned;
there is no implicit latest version.

`limit` defaults to 50 and must be between 1 and 200. Pass the returned `nextCursor` as `cursor`
with the same filters. Versions sort by full ref. Pagination is not a snapshot: concurrent
registrations or metadata updates can change subsequent pages. `nextCursor` is null on the last page.

## Replace metadata

Registration, exact reads and metadata updates return `metadataRevision` and a matching quoted
numeric `ETag`. To replace metadata, send the current value as `If-Match`, for example `"1"`:

```json
{"metadata": {"team": "operations"}}
```

The map replaces all previous pairs; `{ "metadata": {} }` clears it. Successful updates increment
the revision, update `updatedAt`, and retain the ref, descriptor and `createdAt`. A missing
`If-Match` returns `428`. Stale revisions, weak validators, wildcards and validator lists return
`412`. Read the current record before reconciling a conflict.

Metadata is a `Map<String, String>` with at most 32 pairs. Keys use 1–64 UTF-8 bytes; values use
at most 512 UTF-8 bytes; total key and value bytes must not exceed 16 KiB. Unknown body fields,
duplicate JSON keys, explicit nulls, trailing JSON and non-string metadata values are rejected.
Metadata is for search and display and has no effect on approval permissions or thresholds.

## Persistence

Descriptors, metadata, uniqueness indexes, sessions/runtime, signed preparations, commit
certificates and replication outboxes are signed in `cf_approvers` using each peer's integrity
key. Full database snapshots include them. Preserve integrity-key history when restoring.
Registry transactions synchronously flush the WAL before acknowledging PREPARE or commit.
Registry restoration and promotion transfers require the same durability for their whole transaction.
Read-only transactions and unchanged repeat deliveries do not write or synchronize the WAL.
Ordinary key stores retain their existing write options. Column families still share the
physical WAL and disk, so registry fsync can affect concurrent write latency.

Mutations are ordered by the lowest peer ID in the current membership. A mono Keeper has one
member even when its configuration includes future promotion targets. Any public peer forwards
the caller's original authenticated request to the writer. Before preparation, every current
member must be ready with matching topology; identity keys are obtained through authenticated,
signed peer responses. Every member independently checks the actor's permission, exact command,
canonical descriptor, key ownership, metadata revision and WebAuthn proof where applicable.
No member can authorize a registry change on behalf of the others.
Peer coordination serializes registry mutations. Signing, registry reads and health checks
do not acquire the registry mutation monitor.

Each member durably reserves the exact proposal and signs a PREPARE receipt. Only a certificate
containing a valid receipt from every current member authorizes commit. Signature registration,
WebAuthn finish and metadata updates succeed only after every member has persisted the result.
WebAuthn options also require every member online and mirror the actor-bound session everywhere.

An unavailable or sealed member causes `503 APPROVER_REPLICATION_UNAVAILABLE`. Failure during
the protocol can leave reservations or committed copies. Surviving prepared members can collect
the remaining receipts and deliver a complete certificate without the writer or a still-valid
actor token. Durable retries resume after restarts; recipients retain delivery work too. Partial
preparations without a complete certificate remain locked, including after expiry.

Each peer retains at most 256 uncommitted preparations, including expired ones. Expiry does not
free this capacity while protective locks remain; another preparation then returns 429.
An identical registration retry converges to the existing version. For a metadata retry, read the current
revision before reconciling the previous request. Older deliveries cannot roll metadata back.

ECC and PQC share recovery obtain a validated registry snapshot from every selected helper.
Helpers must have no uncommitted preparations and agree on records, revisions, runtime,
sessions and certificates at one shared cutoff. Certified commits can be recovered while their
delivery queues remain pending; these local queues are not transferred. The target rebuilds its registry and uniqueness
indexes atomically with key installation, signing restored data with its own integrity key.

Mono-to-threshold promotion transfers the registry even when no key sets exist. A nonempty
registry additionally requires `tkeeper.approvers.register` and `tkeeper.approvers.metadata` on
the promotion principal. The source pins one transfer draft and blocks registry mutations until
promotion completes. Targets accept only the source-authenticated draft, only into an empty
settled registry/vault with no active DKG, and permanently bind retries to the same transfer.
After a failed promotion, retry the same transfer; elapsed TTL does not discard its safety state.

Registration and metadata writes use the existing audit pipeline. Successful events include
`context.approverRef` and `context.metadataRevision`; metadata remains protected by the request
body digest and is not copied into the audit context. These fields describe registry changes,
not verified approval votes.

Share recovery does not replace full peer backups or rebuild node identity and seal state. See
[backup and recovery](../deployment/backup-and-recovery.md) and [OpenAPI](../../openapi.yaml).
