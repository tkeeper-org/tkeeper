# Status and limitations

These limits affect signing availability, key custody, and the checks required in an integration.

## Supported operations

TKeeper supports:

- mono and threshold key modes
- governed signing
- key lifecycle operations through DKG, import, refresh, rotation, and destruction
- authority-based signing commands
- four-eye control for supported operations
- replicated signature and WebAuthn approver registry with immutable policy references
- core runtime configuration and permitted signing identity catalog
- signed audit records and audit sink enforcement
- build-time feature selection
- build-time cryptographic platform selection
- ECC and ML-DSA platform support
- optional ECIES support when the ECIES feature is built
- optional ECC and ML-DSA peer-share recovery when the recovery feature is built

## Build-time module limits

Features and platforms are selected when the artifact is built.

Missing features make their endpoints or command types unavailable. Include the platforms required by the selected features and key algorithms. See [Build and Features](../deployment/build-and-features.md).

## ML-DSA limits

Threshold ML-DSA signing is probabilistic. Rejection sampling can stop an attempt even when peers follow the protocol. TKeeper retries with fresh session state.

The retry cap is controlled by:

```text
keeper.session.mldsa.max-rounds
```

The default is `12`.

If the cap is exhausted, TKeeper returns `SESSION_MAX_ROUNDS_EXCEEDED`. This is an availability outcome. It does not automatically prove that a peer is dead or malicious.

ML-DSA refresh advances the generation while carrying each peer's existing share and public key forward unchanged. It does not replace shares or refresh cryptographic material. Use rotate or a new DKG when new ML-DSA material is required.

## Failure injection

Failure injection is only for integration tests.

The development integration image includes controls that can corrupt or delete key state. Do not deploy it in production. Regular production builds exclude failure injection. Recovery requires explicit selection and a temporary maintenance deployment. See [Backup and Recovery](../deployment/backup-and-recovery.md).

## Trusted dealer import

Trusted dealer import intentionally starts from reconstructed or externally held key material. Use it only when that trust model is acceptable.

Threshold mode after trusted dealer import still requires quorum for later operations, but the import path itself depends on the dealer and the imported material being trusted.

## Policy limits

Policy can be bypassed when:

- the downstream system accepts another key
- the caller can bypass the governed proof
- policy is checked but not bound to the signed intent
- broad permissions allow unintended operations
- operators enable dev authentication without protecting its token and permissions as production credentials

Cryptographic validity alone does not establish business validity, freshness, or replay safety. The verifier must check the expected key and the exact governed payload. It must also enforce the action's requirements for nonces, expiry, environment, and idempotency.

## Operational limits

Approver registration, WebAuthn enrollment and metadata writes require every current member
to be ready and persist the result. One unavailable member stops these writes even when enough
peers remain for signing. A failed write can leave durable preparations or delivery work. Expiry
does not release protective locks on a partially signed proposal. Retry an identical registration
after recovery and reconcile metadata revisions before replacing them. See
[registry persistence](../api-reference/approvers.md#persistence).

Existing policies resolve exact refs locally, so signing does not require the registry writer.
WebAuthn proofs do not establish that different credentials belong to different people, and
assertion counters are not used for clone detection. Credential assignment and human identity
checks belong to the registrar.

Threshold cryptography adds distributed-system failure modes:

- peers can be unavailable
- sessions can time out
- one peer can see a partial operation while another does not
- consistency repair may be needed after crashes or partitions
- latency depends on quorum participation and protocol rounds

These costs must be included in availability targets and incident runbooks.

Quorum is not backup. Each peer has local state and independent seal dependencies. Recovery must preserve enough shares without collapsing them into one administrative failure domain.

Do not assume mixed-version peer compatibility. Validate the exact upgrade path and keep the cluster on a consistent artifact, feature set, and platform set.

## Security review boundary

The [Threat Model](../security-model/threat-model.md) lists trust assumptions and residual risks. [Security Assurance](../security-model/security-assurance.md) maps tested behavior to executable evidence within the coverage stated for each test.
