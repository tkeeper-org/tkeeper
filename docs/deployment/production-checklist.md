# Production Checklist

## Artifact

- [ ] Build only required production features.
- [ ] Include required platforms explicitly.
- [ ] Do not deploy `exploit/tkeeper:dev`.
- [ ] Include `auth-dev` only when explicitly required; otherwise confirm it is absent.
- [ ] Do not include failure-injection outside integration tests.
- [ ] Pin the release artifact used by every peer.
- [ ] Verify artifact provenance and integrity before rollout.
- [ ] Confirm every peer runs the same feature and platform set.
- [ ] Validate protocol compatibility before a rolling upgrade; changes to Fiat-Shamir domains or GG20 MtA wire formats require a coordinated upgrade.

## Authentication and permissions

- [ ] If using developer authentication, protect its token and config as production credentials and grant least privilege.
- [ ] Configure the explicitly selected authenticator for the deployment.
- [ ] Bind JWT tokens to expected issuer and audience when using JWT.
- [ ] Keep signing, lifecycle, import, destroy, and audit permissions separate.
- [ ] Review wildcard permissions.

## Network

- [ ] Public API is reachable only where intended.
- [ ] Public API TLS is enabled; JWT mode fails startup when the public server is plaintext.
- [ ] Internal API is reachable only by TKeeper peers.
- [ ] Protected internal routes use TLS; configure mTLS with a distinct `tls-spki-sha256` binding for every peer.
- [ ] Peer URLs use the expected internal addresses.
- [ ] Public API rate limits and request-size limits are enforced at the edge.
- [ ] Hosts have synchronized clocks for JWT, approval, expiry, and audit checks.

## Seal and recovery

- [ ] Use the intended seal provider.
- [ ] Store Shamir shares or provider recovery material outside the node.
- [ ] Test unseal after restart.
- [ ] Restrict access to HSM/KMS keys used for sealing.
- [ ] Back up each peer's full database according to the recovery design.
- [ ] Test restoring a peer without placing enough key shares and unseal material in one failure domain.
- [ ] Validate the full [Backup and Recovery](backup-and-recovery.md) procedure before go-live.

## Authorities

- [ ] Use structured authorities for governed identities.
- [ ] Leave `keeper.authority.arbitrary.enabled` disabled unless raw signing is explicitly required.
- [ ] Treat `arbitrary` identities as raw-signing identities.
- [ ] Pin authority OCI references by digest.
- [ ] Do not mix `arbitrary` with concrete authorities on the same identity.
- [ ] Confirm downstream systems verify TKeeper proof before execution.
- [ ] Confirm verifiers pin the expected identity and cover every effect-changing field.
- [ ] Define replay, nonce, expiry, and idempotency behavior for each signed action.

## Quorum

- [ ] Use threshold mode for high-impact identities.
- [ ] Initialize every peer with the same `threshold` and `total`.
- [ ] Confirm each peer is unsealed and ready.
- [ ] Monitor threshold session latency and failure rates.
- [ ] Place peers and their seal dependencies in independent failure domains where the threat model requires it.

## Audit

- [ ] Configure at least one audit sink.
- [ ] Decide whether audit sink failure blocks operations.
- [ ] Test audit verification.
- [ ] Alert on audit sink outage.
- [ ] Restart all peers after an integrity-key rotation so process-local peer pins are re-enrolled.

## ML-DSA

- [ ] Monitor retry counts.
- [ ] Keep `keeper.session.mldsa.max-rounds` bounded.
- [ ] Set end-to-end request deadlines.
- [ ] Use rotate, not refresh, when new ML-DSA material is required.

## Incident readiness

- [ ] Document who can seal, unseal, rotate, destroy, import, and repair consistency.
- [ ] Test recovery from one sealed or unavailable peer.
- [ ] Test denied policy and denied permission paths.
- [ ] Keep a runbook for `SESSION_MAX_ROUNDS_EXCEEDED`, quorum failure, and audit outage.
- [ ] Define the response to suspected mono-key exposure before quorum promotion; promotion alone does not remove prior copies.
- [ ] Rotate any GG20 generation exposed to a protocol version that transmitted MtA masks or permitted reusable signing state; refresh does not remove that exposure.
