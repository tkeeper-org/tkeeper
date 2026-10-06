# Security Model

For concrete authorities, TKeeper checks caller permissions, authority policy, required approvals, key state, and configured audit before signing. In threshold mode, enough peers must accept the operation and contribute.

The executing system must verify the expected key and signed action, then enforce expiry and replay rules. An execution path that skips these checks bypasses TKeeper's controls.

Read:

- [Threat Model](threat-model.md)
- [Security Assurance](security-assurance.md)
- [Quorum Modes](quorum-modes.md)
- [Authentication and Authorization](authentication-authorization.md)
- [Audit Logging](audit-logging.md)
- [Four Eye Control](four-eye-control.md)

## Security goals

TKeeper is designed to:

- prevent unauthenticated or unauthorized clients from using key identities
- bind signatures to understood intents where concrete authorities are used
- keep raw `arbitrary` signing isolated from concrete authorities
- require quorum participation in threshold mode
- reject invalid peer contributions where protocols can verify them
- record security-relevant operations in signed audit logs
- fail closed when required audit sinks are unavailable
- keep integration-only failure injection out of production builds

## Non-goals

TKeeper does not:

- protect an action that can bypass the governed identity
- make a bad authority policy safe
- protect against compromise of at least `threshold` peers
- replace host, network, container, or HSM hardening
- act as a standalone AI firewall, AML system, or fraud engine
- make `arbitrary` raw signing semantically governed
- guarantee availability when fewer than the required peers are healthy
- prevent replay when the signed intent and verifier do not enforce freshness

## Security review checklist

Ask these questions during review:

- Does the downstream system verify TKeeper proof before executing the effect?
- Does it trust the expected key identity and reject unsigned effect-changing fields?
- Are replay, expiry, nonce, and idempotency rules explicit?
- Are high-risk identities in threshold mode?
- Are lifecycle/import/destroy permissions separated from signing?
- Are authority artifacts digest-pinned?
- Are `arbitrary` identities intentionally accepted as raw-signing identities?
- Is developer authentication disabled, or explicitly accepted and protected as a production credential?
- Is the internal peer API private?
- Are audit sinks configured and tested?
- Is the integration image blocked from production deployment?
- Are ML-DSA retry limits and request deadlines monitored?
