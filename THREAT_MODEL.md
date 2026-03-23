# TKeeper Threat Model

**Applicable to:** TKeeper service layer (auth, seal/unseal, peer communication, key lifecycle, audit)  
**Cryptographic protocol threats:** see [tss4j/THREAT_MODEL.md](https://github.com/tkeeper-org/tss4j/blob/main/THREAT_MODEL.md)

---

## Scope

This document covers TKeeper-level security properties and threats. Cryptographic-level threats (GG20, FROST, ECIES, ZK proofs, nonce reuse, Paillier attacks) are documented in the tss4j threat model linked above.

**In scope:**

- Peer authentication and impersonation
- Client authentication and authorization
- Local key share storage (seal/unseal)
- Key lifecycle operations (create, import, refresh, rotate, destroy)
- Audit log integrity and sink enforcement
- Byzantine participant behavior and identifiable abort

**Out of scope:**

- Compromise of ≥ t peers (threshold model limit = no system-level mitigation)
- Physical side channels (EM, power, invasive)
- Host hardening and OS/container isolation

---

## Assets

| Asset                                      | Confidentiality | Integrity | Availability |
|--------------------------------------------|-----------------|-----------|--------------|
| Local key shares (encrypted at rest)       | CRITICAL        | CRITICAL  | HIGH         |
| DEK (Data Encryption Key)                  | CRITICAL        | CRITICAL  | HIGH         |
| KEK (Key Encryption Key / unseal material) | CRITICAL        | CRITICAL  | HIGH         |
| Shamir unseal shares                       | CRITICAL        | CRITICAL  | HIGH         |
| JWT signing keys / JWKS                    | HIGH            | CRITICAL  | HIGH         |
| Audit records                              | LOW             | CRITICAL  | HIGH         |
| Group public keys                          | PUBLIC          | CRITICAL  | MEDIUM       |
| Session context / AAD                      | LOW             | CRITICAL  | HIGH         |

---

## Trust Boundaries

- **Client → Keeper:** all requests are untrusted until authenticated (JWT or dev token) and authorized against explicit permissions.
- **Keeper → Keeper:** inter-peer messages are authenticated; invalid ZK proofs or malformed payloads are detected and the sender identified as an imposter.
- **Keeper → KMS (AWS/GCP):** KEK operations go over provider-authenticated channels; credential compromise is an operational risk, not a protocol risk.
- **Sealed state:** a sealed keeper refuses all protected operations until unsealed: provides a hard stop against runtime compromise without unseal material.

---

## Threat Catalog

### T-1: Client Impersonation

- **Attack:** Attacker presents a forged or stolen JWT to authenticate as a legitimate principal and trigger signing or decryption.
- **Mitigation:**
  - JWT validated against JWKS: signature, `kid`, `aud`, `sub` all checked before any operation proceeds.
  - Permissions are carried in the token and enforced per operation per key: a stolen token with `tkeeper.key.wallet-hot.sign` cannot sign with any other key.
  - JWKS is periodically refreshed; short token TTLs recommended at the IdP.
- **Residual risk:** Compromised IdP or long-lived tokens increase exposure window. Token TTL and rotation policy are operational controls.

### T-2: Privilege Escalation via Permission Misconfiguration

- **Attack:** Overly broad permission grants (e.g. `tkeeper.key.*.*`) allow a principal to destroy or sign with keys they should not access.
- **Mitigation:**
  - Permissions are explicit and key-scoped by default (`tkeeper.key.<logicalId>.<op>`).
  - Deny rules (prefixed with `-`) allow fine-grained restriction on top of broad grants.
  - Deep wildcard (`**`) is explicitly rejected at parse time.
  - Destructive operations (`destroy`, `rotate`) require explicit separate permissions.
- **Residual risk:** Misconfigured grants are an operational risk. Least-privilege grant policy and periodic permission audits are recommended.

### T-3: Peer Impersonation (Byzantine Participant)

- **Attack:** A malicious actor injects a fake peer into a signing or decryption session, submitting crafted protocol messages or invalid ZK proofs to corrupt output or extract information.
- **Mitigation:**
  - Inter-peer messages are authenticated; invalid ZK proofs cause the sending peer to be flagged as an imposter.
  - Imposter identity is recorded in audit logs and returned in operation responses.
  - For signing (GG20 / FROST): operation restarts from scratch with a new quorum excluding the identified imposter. Fresh commitments are generated: no resumption from intermediate state.
  - For decryption: operation completes if ≥ t honest peers remain; imposter list returned in response.
- **Residual risk:** A compromised coordinator can abort the operation (availability impact only); it cannot extract key material from this failure mode.

### T-4: Key Share Extraction via Storage Access

- **Attack:** Attacker gains read access to TKeeper's local storage (RocksDB) and attempts to extract key shares.
- **Mitigation:**
  - All storage data is encrypted at rest using a DEK (AES-256).
  - The DEK is wrapped by a KEK: never stored in plaintext.
  - KEK is held only in locked memory during runtime; storage remains opaque without it.
  - A sealed keeper holds no usable key material at runtime: all protected operations are refused until unseal.
  - Public metadata and key records stored in RocksDB are signed with an internal integrity key. Tampering with storage records is detectable before they are used.
  - The integrity signing key can be rotated independently via `tkeeper.integrity.rotate`.
- **Residual risk:** Memory forensics against a running, unsealed keeper can expose the DEK. Encrypted swap and memory hardening on the host are recommended.

### T-5: Unseal Material Compromise (Shamir)

- **Attack:** Attacker obtains enough Shamir unseal shares (≥ threshold) to reconstruct the KEK and unwrap the DEK.
- **Mitigation:**
  - Shares are generated once at initialization and distributed to separate trusted operators.
  - Share count and threshold are configurable: distribute to increase required collusion.
  - Loss or compromise of shares below threshold does not expose the DEK.
- **Residual risk:** Share handling is an operational control. Shares must be stored under the same controls as recovery credentials. Co-locating all shares with one operator defeats the purpose.

### T-6: KMS Credential Compromise (AWS / GCP seal providers)

- **Attack:** Attacker obtains AWS/GCP credentials used by TKeeper and uses them to unwrap the DEK directly via the KMS API.
- **Mitigation:**
  - KMS key policy should restrict `Decrypt`/`Unwrap` calls to TKeeper's identity (IAM role / service account).
  - Auto-unseal can be disabled (`-Dkeeper.auto.unseal=false`); operator-triggered unseal adds a human gate.
- **Residual risk:** Cloud-provider-level compromise is outside TKeeper's control. IAM least-privilege and CloudTrail/Audit Logs for KMS operations are recommended.

### T-7: Audit Log Tampering or Sink Unavailability

- **Attack:** Attacker suppresses or modifies audit records to hide malicious operations, or causes the audit sink to be unavailable to force TKeeper to proceed without logging.
- **Mitigation:**
  - Audit records are signed and tamper-evident; tampering is detectable via the verification endpoint (`tkeeper.audit.log.verify`).
  - When sink enforcement is enabled, TKeeper **denies the operation** if no configured sink is reachable: no operation proceeds without a durable audit trail.
- **Residual risk:** Sink enforcement is opt-in. Deployments that do not enable it will continue operating during sink outages with no audit record.

### T-8: Key Lifecycle Abuse (Unauthorized Rotate / Destroy)

- **Attack:** Attacker with partial permissions triggers a key rotation or destruction, causing denial of service or permanent key loss.
- **Mitigation:**
  - `destroy` and `rotate` require explicit separate permissions (`tkeeper.key.<id>.destroy`, `tkeeper.dkg.rotate`).
  - Destructive operations are audit-logged with principal identity.
  - Key generation modes (`create`, `rotate`, `refresh`) are separately permissioned (`tkeeper.dkg.<mode>`).
- **Residual risk:** Authorized principals with `destroy` permission can cause permanent key loss. Multi-person approval for destructive operations is an operational recommendation.

### T-9: Denial of Service via Expensive Proof Verification

- **Attack:** Attacker triggers repeated signing or decryption requests to exhaust CPU via expensive ZK proof generation and verification.
- **Mitigation:** Rate limiting and request gating must be applied at the service layer (reverse proxy, API gateway). TKeeper does not enforce rate limits internally.
- **Residual risk:** Without external rate limiting, TKeeper is susceptible to CPU exhaustion. Operational control.

---

## Security Properties Summary

| Property                         | Mechanism                                                                                           |
|----------------------------------|-----------------------------------------------------------------------------------------------------|
| No unilateral key authority      | t-of-n threshold; key never reconstructed                                                           |
| Key shares encrypted at rest     | DEK/KEK envelope encryption via seal provider                                                       |
| Sealed state = zero key exposure | All protected ops refused until unseal                                                              |
| Client authentication            | JWT (JWKS-validated) or dev token                                                                   |
| Authorization                    | Explicit permission identifiers, per-key, per-op; deny rules supported                              |
| Byzantine detection              | ZK proof validation; imposter identity recorded in audit and responses                              |
| Signing restart on fault         | Fresh commitments; no resumption from intermediate state                                            |
| Audit integrity                  | Signed tamper-evident records; sink enforcement available                                           |
| Storage integrity                | Public metadata and key records signed with internal integrity key; tampering detectable before use |
| Memory safety                    | Key material in locked memory; zeroed after use                                                     |

---

## Operational Recommendations

1. Use short-lived JWTs (< 15 min) and configure JWKS refresh accordingly.
2. Apply least-privilege permission grants; avoid `tkeeper.key.*.*` in production.
3. Distribute Shamir unseal shares to separate operators in separate trust domains.
4. Enable audit sink enforcement in production, no operation without a durable trail.
5. Require separate approvals for `destroy` and `rotate` operations via IdP policy.
6. Apply rate limiting at the reverse proxy or API gateway layer.
7. For AWS/GCP seal: restrict KMS key policy to TKeeper's identity; enable KMS audit logging.
8. Review `imposters` and `dead` fields in audit logs after any failed threshold operation.

---