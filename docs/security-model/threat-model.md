# Threat Model

This page lists threats to TKeeper, the controls that address them, and the risks that remain.

For concrete authorities, TKeeper parses the command and checks policy, approvals, audit, and key state before signing. The receiving system must verify the signature and exact action before execution. Raw `arbitrary` signing has no intent policy.

For protocol-level details in FROST, GG20, threshold ML-DSA, ECIES, ZK proofs, nonce handling, Paillier, and elliptic-curve math, use the Anvil threat model:

[Anvil THREAT_MODEL.md](https://github.com/exploit-org/anvil/blob/main/THREAT_MODEL.md)

## Scope

In scope:

- client authentication and authorization
- authority policy
- four eye approvals
- peer authentication and Byzantine behavior
- seal and unseal
- local key share storage
- key lifecycle operations
- trusted dealer import
- audit log integrity and sink enforcement
- control-plane UI access

Out of scope:

- compromise of at least `threshold` peers
- downstream systems that execute effects without verifying TKeeper proof
- bad authority policies approved by operators
- physical side channels
- host hardening
- kernel, container runtime, and hypervisor compromise
- bugs inside cloud KMS, HSM firmware, or external identity providers

## Assumptions

In threshold mode, each peer holds a local key share and an operation requires a quorum. In mono mode, one host holds the full private key; compromising that host compromises the key.

Compromising fewer than `threshold` peers must not give the attacker a usable private key. Compromising at least `threshold` peers breaks the threshold model.

All protected operations run only after the keeper is unsealed.

Production artifacts include only explicitly selected platforms and features. The dedicated integration artifact additionally contains failure-injection controls and must not be deployed as a production image.

Authorities are part of the signing boundary. A key either uses `arbitrary` for raw signing or uses concrete authority policies. `arbitrary` cannot be mixed with concrete authorities on the same key.

Concrete authorities use digest-pinned OCI references. A tag is mutable and does not identify a fixed policy artifact.

Audit events are signed with the integrity key. When audit is enabled, at least one configured sink must accept the event.

## Assets

| Asset | Confidentiality | Integrity | Availability |
| --- | --- | --- | --- |
| Local key shares | Critical | Critical | High |
| DEK | Critical | Critical | High |
| KEK or unseal material | Critical | Critical | High |
| Shamir unseal shares | Critical | Critical | High |
| HSM or cloud KMS credentials | Critical | Critical | High |
| JWT signing keys and JWKS | High | Critical | High |
| Key metadata and authorities | Low | Critical | High |
| Public keys and commitments | Public | Critical | High |
| Authority OCI artifacts | Low | Critical | High |
| Four eye approver keys | High | Critical | Medium |
| Audit records | Low | Critical | High |
| Session context | Low | Critical | High |

## Trust boundaries

Client to Keeper:

Requests are untrusted until authenticated and authorized. JWT mode validates token signature, `kid`, audience, configured issuer, token lifetime, and subject. JWT mode also requires TLS on the public server so bearer credentials are not accepted over plaintext. Dev token mode is for controlled environments.

Keeper to Keeper:

Protected internal routes require TLS outside dev mode. Requests and authenticated responses are signed and bound to the claimed peer id, request nonce, request hash, status, and body. Configure mTLS with a distinct SPKI pin per peer to bind that claimed id to the transport certificate; without it, first enrollment still trusts the shared bootstrap token and network path. Actor credentials are forwarded only to internal operation entrypoints that enforce their permissions. Peers still verify protocol data. Bad FROST, GG20, ML-DSA, or ECIES contributions are rejected. Protocols report an imposter only where the sender can be identified; a normal ML-DSA rejection-sampling abort is not Byzantine evidence.

Keeper to OCI registry:

Authorities are loaded only from explicitly allowed OCI registries. Digest-pinned references protect against tag drift. The authority id inside the artifact must match the id configured on the key.

Keeper to seal provider:

Seal providers protect the DEK. Built-in providers are Shamir and HSM. External providers are AWS and Google Cloud features.

Keeper storage:

Stored key material is AEAD-encrypted. Integrity-sensitive records use one of two location-bound formats: signed records bind the column family, record id, and payload, while integrity private keys and audit-HMAC keys use encrypted envelopes bound to their exact record ids. This prevents a valid record or ciphertext from being moved into another storage slot.

On a legacy V1 upgrade, rebinding internal secrets, signing the initialization envelope, relocating legacy key generations, deleting their source records, and advancing the marker are one cross-column-family transaction. Any validation failure rolls the whole V1 transaction back. The keeper reports not-ready throughout migration and stays sealed on failure, including auto-unseal failure. Relocation is allowed only when the isolated key-version store is empty; pending or mixed state is rejected; generation pointers must be canonical and match signed head/version metadata. Orphan records are not migration roots. Relocated key material remains explicitly legacy and unsigned; only a later refresh or rotate creates a signed, location-bound generation.

The signed initialization envelope binds the peer id and quorum tuple after unseal. Integrity and HMAC version pointers are checked against the latest stored version; integrity-key rotation retains historical public keys but removes historical private keys.

Browser to UI:

The `ui` feature exposes the control-plane UI. It uses the same external API permissions as direct API clients. CSP configuration controls what the browser may load or connect to.

## Threats

### T-1: Client Impersonation

Attack:

An attacker uses a forged or stolen token to call signing, decrypt, lifecycle, or inventory APIs.

Mitigation:

- JWT signature and `kid` are checked against JWKS.
- Audience, configured issuer, lifetime, and subject are checked.
- Permissions are enforced per operation.
- Key operations use key-scoped permissions such as `tkeeper.key.<keyId>.sign`.

Residual risk:

A compromised IdP or long-lived token gives the attacker the permissions inside that token until it expires or is revoked.

### T-2: Permission Misconfiguration

Attack:

A principal gets broad permissions and uses a key or lifecycle operation outside its intended scope.

Mitigation:

- Permissions are explicit.
- Key operations can be scoped per key.
- Deny entries can restrict broad grants.
- Destructive operations use separate permissions.

Residual risk:

An operator can still grant broad access. Review wildcard grants before production use.

### T-3: Authority Downgrade

Attack:

An attacker tries to create or import a key with `arbitrary` authority and concrete authorities together, or tries to move a key from typed policy to raw signing.

Mitigation:

- `arbitrary` must be the only authority on a key.
- Concrete authorities require OCI references.
- Authority ids are validated.
- Authority policy is evaluated before signing starts.
- Asset Inventory exposes key authorities for review and export.

Residual risk:

An authorized operator can create a raw-signing key on purpose. Treat `arbitrary` keys as high risk.

### T-4: Authority Artifact Tampering

Attack:

An attacker changes the authority artifact in the registry or points a key at a different policy.

Mitigation:

- Production references use `@sha256:...`.
- `oras.allowed-registries` restricts outbound pulls to exact registry authorities.
- TKeeper verifies the loaded authority id against the configured id.
- Authority metadata is part of signed key state.
- Audit logs record authority-related operations.

Residual risk:

If a bad policy is approved and pushed under its digest, TKeeper will enforce that bad policy. Review authority artifacts before attaching them to keys.

### T-5: Policy or Intent Modeling Gap

Attack:

The policy sees a weak model of the requested action and allows a command whose real effect is unsafe.

Mitigation:

- Typed authorities materialize commands into policy input.
- EVM, Bitcoin, X.509, and custom authorities have separate intent builders.
- `arbitrary` is isolated from typed authority keys.

Residual risk:

Policy can only enforce the effects it can model. Raw bytes give policy almost no semantic context. Custom authorities reject undeclared JSON fields. A backend can still bypass policy if it executes fields added after signing or taken from a separate request.

### T-6: Four Eye Replay or Bypass

Attack:

An attacker reuses approval proofs for another request or tries to submit duplicate approvers.

Mitigation:

- Approvers sign a hash of the exact operation fields.
- The hash includes nonce and timestamp.
- Duplicate approver keys are rejected.
- A coordinator consumes the nonce only after enough signatures have verified and persists it across restarts for the configured approval TTL.
- `m` must be at least `2`, and `m` cannot exceed `n`.

Residual risk:

Compromised approver keys can approve malicious requests. Store approver keys separately from TKeeper peers. Protocol retries reuse the same approval, so non-coordinator peers verify its signatures, request-field binding, and TTL but do not independently consume its nonce. A compromised coordinator that bypasses its own nonce check can therefore replay a still-fresh approval with the same approved request fields. Current lifecycle and session checks still apply, but independent peer-side replay prevention is not provided.

### T-7: Byzantine Peer During Signing

Attack:

A peer sends invalid FROST, GG20, or threshold ML-DSA data to corrupt a signature or bias the result.

Mitigation:

- FROST verifies peer proof material and signing contributions.
- FROST signing nonces are atomically consumed and cannot produce a second partial signature.
- GG20 verifies the ZK proof flow used by the protocol; MtA responses expose only the ciphertext and proof, never the respondent mask or encryption randomness.
- GG20 signing state emits at most one partial signature.
- FROST and GG20 session clients are destroyed on success, abort, expiry, and shutdown.
- Threshold ML-DSA binds commitments, reveals, participants, message context, and partial responses, then verifies the combined standard ML-DSA signature.
- Identified bad peers are returned as `imposters`.
- Signing restarts with fresh session state where the protocol reports an imposter.

Residual risk:

Byzantine peers can cause availability loss by aborting sessions. Threshold ML-DSA does not provide identifiable abort for every failure. A defect that exposes an MtA mask or permits reuse of FROST/GG20 signing state can invalidate the threshold confidentiality assumption; affected key generations require rotation, not refresh.

### T-8: Byzantine Peer During ECIES Decrypt

Attack:

A peer returns a forged partial decrypt.

Mitigation:

- Each partial decrypt carries a DLEQ proof.
- The coordinator verifies the proof against the ciphertext point, derived peer public share, and partial decrypt.
- Bad partial decrypts are skipped and reported as imposters.
- Decrypt succeeds only if enough honest partial decrypts remain.

Residual risk:

Too many unavailable or dishonest peers can stop decryption.

### T-9: Local Storage Read or Tamper

Attack:

An attacker reads RocksDB files or changes stored records.

Mitigation:

- Key shares are encrypted at rest.
- The DEK is wrapped by seal material.
- Signed records protect integrity-sensitive state.
- A sealed keeper refuses protected operations.

Residual risk:

Memory forensics against an unsealed keeper can expose runtime secrets. Signatures detect altered or relocated records, but they cannot by themselves detect a coherent same-location replay of an older record set. This includes replaying a key head with its matching key and metadata records, or rolling back the complete database.

During the first upgrade from legacy V1 storage, TKeeper can authenticate the legacy ciphertext with the DEK and verify its signed metadata, but it cannot prove that an unbound ciphertext was not substituted before that migration. Relocation does not add a signature to that key material; it remains legacy until refresh or rotate.

Pre-2.2 platform side-state and sessionless destroy-marker formats that do not embed their identity remain read-compatible until the corresponding key lifecycle rewrite; relocating one fails later consistency checks or can force a fail-closed denial of service.

Verify and protect the existing database and backups before the first 2.2 unseal. Use host storage controls, encrypted swap, durable external audit export, an independently protected monotonic checkpoint where rollback detection is required, and protected backups.

### T-10: Unseal Material Compromise

Attack:

An attacker obtains enough Shamir shares, HSM access, or cloud KMS rights to unwrap the DEK.

Mitigation:

- Shamir uses configurable `threshold` and `total`.
- HSM keeps wrapping keys outside TKeeper storage.
- AWS and Google Cloud providers rely on provider IAM and KMS audit logs.
- Auto-unseal can be disabled.

Residual risk:

Seal providers move trust into operators, HSM policy, or cloud IAM. Treat that material like root recovery access.

### T-11: Audit Tampering or Sink Failure

Attack:

An attacker edits audit logs or makes sinks unavailable.

Mitigation:

- Audit events are signed with the integrity key: Ed25519 when `ecc` is included, or ML-DSA-44 in a PQC-only build.
- Verification uses the integrity public key version recorded in the event.
- If audit is enabled, protected operations require at least one available sink.
- If all configured sinks fail or time out while writing, the operation fails.

Residual risk:

Deployments without audit enabled lose this control.

### T-12: Trusted Dealer Abuse

Attack:

An authorized caller imports weak or unauthorized key material through trusted dealer flow.

Mitigation:

- Trusted dealer import is separately permissioned.
- Imported keys are checked against their declared algorithm, authorities, policy, and audit requirements.
- Stored key records are integrity-protected.

Residual risk:

Trusted dealer mode trusts the importer to bring valid key material. Use it only for migration or recovery flows that need it.

### T-13: Key Lifecycle Abuse

Attack:

An attacker rotates, refreshes, destroys, or runs consistency repair on a key to cause denial of service or move the key into an unexpected state.

Mitigation:

- Lifecycle operations use separate permissions.
- Destructive operations are audit-logged.
- Key metadata and active generations are integrity-protected.
- Refresh and rotate write a new signed generation and never overwrite a legacy generation in place.
- Threshold destroy commit and abort messages are accepted only from the peer that prepared the signed destroy session.
- ECC refresh reshapes the existing secret shares without changing the public key. Rotate creates new key material.
- ML-DSA refresh carries each peer's existing share and public key into the new generation unchanged; it does not replace shares or refresh cryptographic material. ML-DSA rotate runs a new DKG and creates a new key.
- Consistency repair is an explicit API, not part of normal signing flow.

Residual risk:

Authorized lifecycle operators can still break availability. A compromised ML-DSA share remains compromised after refresh; use rotate when new cryptographic material is required. Keep lifecycle permissions narrower than signing permissions.

### T-14: UI Exposure

Attack:

An attacker uses the UI to trigger privileged operations from a browser session.

Mitigation:

- UI calls the same authenticated external APIs.
- UI can be disabled.
- CSP limits script, connect, image, and form targets.
- Browser-originated operations still require permissions and approvals.

Residual risk:

Bad CSP or weak browser session handling can expose operators to web attacks. Keep UI access narrow.

### T-15: Probabilistic ML-DSA Signing Exhaustion

Attack or failure:

A healthy threshold ML-DSA signing operation repeatedly aborts during rejection sampling, or an attacker amplifies the cost by submitting many authorized signing requests.

Mitigation:

- Each retry creates fresh session state and fresh signing randomness.
- `keeper.session.mldsa.max-rounds` bounds complete signing attempts; it defaults to `12`.
- Session expiry and caller-side deadlines bound retained state and end-to-end latency.
- Exhaustion fails closed with `SESSION_MAX_ROUNDS_EXCEEDED`; no signature is returned.

Residual risk:

Threshold ML-DSA is probabilistic and does not provide a hard success-latency guarantee. Exhaustion with empty `dead` and `imposters` sets is not proof of corruption. Monitor retry counts and latency; increasing the attempt cap trades availability for resource use and worst-case response time.

### T-16: Integration Artifact in Production

Attack:

An operator deploys the integration image, exposing the failure-injection module used to corrupt, demote, delete, or replace test key state.

Mitigation:

- Regular `shadowJar` and `dockerBuild` include only selected production platforms and features.
- `:integration-tests:failure-injection` is wired only into `shadowJarIntegration` and `dockerBuildIntegration`.
- The integration image uses the separate `exploit/tkeeper:dev` tag.

Residual risk:

Build separation cannot prevent an operator from deploying the wrong artifact. Production admission and release policy must reject the integration jar and `exploit/tkeeper:dev` image.

### T-17: Downstream Proof Misuse

Attack:

A downstream service accepts a valid signature for the wrong identity, executes a payload that differs from the governed intent, relies on unsigned fields, or replays a previously valid proof.

Mitigation:

- Verifiers pin the expected identity or public key.
- The executed effect is reconstructed from the exact governed command.
- Security-relevant context is included in the signed intent or checked before execution.
- Nonces, expiry, sequence numbers, or idempotency keys are enforced where replay matters.
- Custom-authority integrations reject or ignore undeclared fields before execution.

Residual risk:

TKeeper cannot enforce a downstream path that misinterprets or bypasses its proof. Cryptographic validity does not establish business validity, freshness, or correct environment by itself.

## Security properties

| Property | Mechanism |
| --- | --- |
| No unilateral key use in threshold mode | `t-of-n` threshold protocols |
| No key reconstruction in normal threshold flows | FROST, GG20, threshold ML-DSA, and threshold ECIES use shares |
| Raw signing isolated | `arbitrary` cannot be mixed with concrete authorities |
| Typed signing policy | authorities materialize commands before signing |
| Authority immutability | digest-pinned OCI references |
| Four eye binding | approver signatures over operation hash |
| Byzantine detection | protocol proofs, DLEQ checks, imposter reporting |
| Sealed state | protected operations refused until unseal |
| Storage confidentiality | DEK/KEK envelope encryption |
| Storage integrity | signed key and metadata records |
| Audit integrity | integrity-key signatures over encoded events |

## Operational checklist

- Use short-lived JWTs.
- Configure the expected JWT issuer and audience explicitly.
- Do not enable dev token mode in production unless its risk is explicitly accepted and its token and permissions are protected as production credentials.
- Avoid broad wildcard permissions.
- Treat `arbitrary` keys as raw signing keys.
- Use digest-pinned OCI authorities.
- Review Asset Inventory exports.
- Distribute Shamir shares across separate operators.
- Restrict HSM, AWS KMS, and Google Cloud KMS access to TKeeper identities.
- Enable audit with more than one sink.
- Watch `imposters` and `dead` fields after failed threshold operations.
- Put rate limiting in front of public endpoints.
