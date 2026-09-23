# Authorities

Authorities bind a key identity to the actions it may authorize.

With concrete authorities, TKeeper checks the requested effect before signing starts.

An authority document is security policy and an intent schema. Review changes to either with the same care as changes to signing code.

TKeeper validates the document, intent config, public approver material, and CEL policy before creating or importing a key. The policy compiles against the selected intent's strict root schema.

## Threshold-backed authorization

In threshold mode, authority enforcement is backed by the same `t-of-n` boundary as key use: fewer than `t` compromised peers cannot complete a threshold signature for an action rejected by the honest peers. This makes the governed identity the strongest authorization boundary in the stack.

Treat authority documents accordingly: keep them narrow, review every schema and policy change, and attach them through digest-pinned references. See [Quorum Modes](../security-model/quorum-modes.md) and the [Threat Model](../security-model/threat-model.md) for detailed guarantees, assumptions, and residual risks.

## Key authorities

A key stores a list of authorities.

Concrete authorities use OCI references:

```json
[
  {
    "id": "production-deployment",
    "oci": "oci://registry.example/verdict/authorities/production-deployment@sha256:..."
  }
]
```

`arbitrary` is for raw data signing. It is useful for demos and compatibility, but it gives TKeeper no semantic intent:

```json
[
  { "id": "arbitrary" }
]
```

Rules:

- the request field is a JSON array
- every key needs at least one authority
- use `arbitrary` for raw signing
- use concrete authorities for policy-checked commands
- raw `arbitrary` signing requires `keeper.authority.arbitrary.enabled = true`
- `arbitrary` does not use an OCI reference
- OCI authority documents cannot declare `type: arbitrary`
- `arbitrary` cannot be mixed with concrete authorities on the same key
- non-arbitrary authorities require an OCI reference
- concrete authorities must be digest-pinned with `@sha256:...`
- tags are for local development, not production trust anchors
- authority ids must be unique on the same key

### Design advice: one action per authority

Treat one authority document as one logical action. A document can technically contain rules for several unrelated actions, but doing so mixes intent meaning, limits, approvers, and audit interpretation. Multiple rules are useful when they express conditions for the same action, such as automatic and reviewed amount ranges. Keep different actions, destinations, networks, and certificate profiles under separate authority ids and separately reviewed OCI digests.

## Authority document

Concrete authorities are Verdict authority documents. `custom` defines a typed JSON request directly in the document and is the neutral starting point for a new integration.

### Custom authority example

This example defines a custom typed authority and a matching command. Its policy shows standard CEL and at least one function from each helper category: effects, decimal, bigint, lists, network, semver, crypto, and time.

```yaml
schemaVersion: verdict.authority/v1
id: production-deployment
type: custom
version: 1.0.0

metadata:
  title: Reviewed production deployment

config:
  fields:
    action:
      type: string
    service:
      type: string
    environment:
      type: string
    releaseVersion:
      type: string
    sequence:
      type: bigint
    riskScore:
      type: decimal
    roles:
      type: list
      items:
        type: string
    sourceIp:
      type: string
    requestedAt:
      type: time
    expiresAt:
      type: time
    changeProof:
      type: bytes
  effects:
    - type: deployment.release
      fields:
        action: "$action"
        service: "$service"
        environment: "$environment"
        version: "$releaseVersion"
        sequence: "$sequence"

policy:
  id: production-deployment
  fallback: DENY
  variables:
    allowedEnvironments: [production]
    requiredRoles: [release-manager, production]
    allowedCidrs: ["10.20.0.0/16", "fd00:20::/48"]
    minimumReleaseVersion: "2.4.1"
    maximumRiskScore: "0.25"
    minimumSequence: "10000000000000000000"
    maximumWindowSeconds: 300
    expectedProofHash: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a"
  allow:
    - id: allow-reviewed-deployment
      where:
        - "action == 'deploy' && environment in allowedEnvironments"
        - "roles.exists(role, role == 'release-manager')"
        - "effect.one(effects, 'deployment.release')"
        - "decimal.lte(riskScore, maximumRiskScore)"
        - "bigint.gte(sequence, minimumSequence)"
        - "lists.containsAll(roles, requiredRoles)"
        - "ip.isValid(sourceIp) && cidr.matchesAny(sourceIp, allowedCidrs)"
        - "semver.isValid(releaseVersion) && semver.gte(releaseVersion, minimumReleaseVersion)"
        - "crypto.sha256(changeProof) == expectedProofHash"
        - "time.before(requestedAt, expiresAt) && time.durationSeconds(requestedAt, expiresAt) <= maximumWindowSeconds"
  deny: []
```

Each expression demonstrates a policy surface:

| Category | Expression in the example | Purpose |
| --- | --- | --- |
| Standard CEL | `action == ...`, `in`, `roles.exists(...)` | operators, membership, and macros |
| Effects | `effect.one(...)` | normalized consequence count |
| Decimal | `decimal.lte(...)` | exact risk-score comparison |
| Bigint | `bigint.gte(...)` | integer comparison beyond 64-bit range |
| Lists | `lists.containsAll(...)` | required role set |
| Network | `ip.isValid(...)`, `cidr.matchesAny(...)` | source address validation |
| Semver | `semver.isValid(...)`, `semver.gte(...)` | release version floor |
| Crypto | `crypto.sha256(...)` | digest binding for Base64-decoded bytes |
| Time | `time.before(...)`, `time.durationSeconds(...)` | bounded request window |

The matching command in [Request matching](#request-matching) passes every condition. `changeProof` is Base64 for bytes `01 02 03 04`; its SHA-256 value is the `expectedProofHash` constant above.

### Document fields

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | `verdict.authority/v1`. |
| `id` | yes | Stable authority id. Must match the id attached to the key. |
| `type` | yes | Intent type. Must match the command artifact type. |
| `version` | yes | Human release version. Not a trust anchor. |
| `metadata` | no | Labels for humans. TKeeper does not enforce them. |
| `config` | no | Trusted intent config. |
| `policy` | yes | Verdict policy. |

TKeeper rejects the authority when the loaded document id does not match the configured key authority id.

## Request matching

For a concrete authority, the sign command must reference an authority attached to the key:

```json
{
  "keyId": "deployment-signing",
  "command": {
    "type": "custom",
    "authorityId": "production-deployment",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "action": "deploy",
        "service": "billing-api",
        "environment": "production",
        "releaseVersion": "2.4.1",
        "sequence": 10000000000000000001,
        "riskScore": 0.20,
        "roles": ["release-manager", "production"],
        "sourceIp": "10.20.4.17",
        "requestedAt": "2030-01-02T03:04:05Z",
        "expiresAt": "2030-01-02T03:09:05Z",
        "changeProof": "AQIDBA=="
      }
    }
  }
}
```

The command `authorityId` must exist on the key.

The command `type` must match the authority document `type`.

The authority document `id` must match the key authority id.

If policy returns `ALLOW`, TKeeper starts threshold signing. If the policy returns `DENY`, signing does not start.

For `arbitrary`, TKeeper only checks that the key allows `arbitrary` and that the command artifact type is `arbitrary`. No Verdict policy is loaded.

## Intent types

Authority `type` selects the payload format and policy context.

| Authority type | Build feature | Command data | Main policy surface |
| --- | --- | --- | --- |
| [`custom`](arbitrary-and-typed.md) | core | typed JSON | declared fields and configured `effects` |
| [`evm.transaction`](digital-assets/evm.md) | `evm` | unsigned serialized EVM transaction | transaction fields, decoded call, `effects` |
| [`bitcoin.transaction`](digital-assets/bitcoin.md) | `bitcoin` | unsigned tx, previous txs, signing input, sighash | inputs, outputs, fee, sighash, `effects` |
| [`tron.transaction`](digital-assets/tron.md) | `tron` | unsigned transaction JSON | contracts, fee limit, `effects` |
| [`xrp.transaction`](digital-assets/xrp.md) | `xrp` | unsigned transaction hex | payment, fee, ledger limit, `effects` |
| [`solana.transaction`](digital-assets/solana.md) | `solana` | unsigned transaction Base64 | instructions, signers, `effects` |
| [`ap2.mandate`](agentic-payments.md) | `ap2` | JWS signing input and SD-JWT disclosures | payment, checkout, request total |
| [`mcintent.mandate`](agentic-payments.md) | `mc-vi` | JWS signing input and SD-JWT disclosures | payment, checkout, request total |
| [`x509.tbs-certificate`](x509.md) | `authority-x509` | DER-encoded TBS certificate | subject, issuer, validity, extensions |
| `arbitrary` | core | raw bytes | no Verdict policy |

If a feature module is missing, TKeeper cannot process that command type and returns `INVALID_AUTHORITY_ARTIFACT`.

Build example:

```bash
./gradlew shadowJar -Pkeeper.features=agentic-payments,digital-assets,authority-x509 -Pkeeper.platforms=ecc
```

## Effects

Effects are normalized consequences exposed to CEL as `effects`.

Raw request fields explain the input. Effects describe what the input does.

Example effect:

```json
{
  "type": "deployment.release",
  "action": "deploy",
  "service": "billing-api",
  "environment": "production",
  "version": "2.4.1",
  "sequence": 10000000000000000001
}
```

Common CEL pattern:

```cel
effect.onlyTypes(effects, ['deployment.release']) &&
effect.one(effects, 'deployment.release') &&
effect.any(effects, 'deployment.release', {
  'service': expectedService,
  'environment': 'production'
})
```

Native intent modules fail closed when they cannot describe a consequence.

Examples:

- EVM call to an unknown contract.
- EVM whitelisted function without an effect mapping.
- Bitcoin output script that cannot be classified.
- Bitcoin input without the previous transaction.

Typed JSON authorities produce only the effects declared in authority config.

## Policy format

Authority policies use `allow`, `deny`, and `fallback`:

```yaml
policy:
  id: policy-id
  fallback: DENY
  variables:
    expectedService: billing-api
  allow:
    - id: allow-example
      where:
        - "effect.one(effects, 'deployment.release')"
      unless:
        - "time.after(time.now(), expiresAt)"
  deny:
    - id: deny-example
      where:
        - "action == 'delete'"
```

Rules:

- policy id must be non-blank
- rule ids must be unique across `allow` and `deny`
- a rule matches when every `where` expression is `true`
- a rule does not match when any `unless` expression is `true`
- empty `where` and empty `unless` match unconditionally
- policy variables are available as root CEL variables
- policy variables must not collide with declared intent roots
- deny matches override allow matches
- if no rule matches, `fallback` is returned

Decision order:

1. Evaluate every deny and allow rule.
2. Return `DENY` when at least one deny rule matches.
3. Collect approval groups from every matching allow rule that declares `approvals`.
4. Return `ALLOW_WITH_REQUIREMENTS` when the collected list is non-empty; otherwise return `ALLOW`.
5. Apply `fallback` when no allow rule matches.

`ALLOW` starts signing. `ALLOW_WITH_REQUIREMENTS` starts signing after every collected group passes. `DENY` stops the operation before threshold signing.

### Policy-driven approval groups

Declare named approver keys once and reference their names from allow rules:

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
      where: ["purpose == 'payment'"]
      approvals:
        threshold: 2
        approvers: [operator-a, operator-b]
    - id: compliance-review
      where: ["purpose == 'payment'"]
      approvals:
        threshold: 1
        approvers: [compliance]
```

Both groups apply when both rules match. Every group receives the same signed request hash and all proofs travel in one `approvals.proofs` array.

Conditional fallback:

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

Approval validation:

- approvals are valid on allow rules
- `fallbackApprovals` requires `fallback: ALLOW_WITH_REQUIREMENTS`
- every selected approver name must exist in `policy.approvers`
- names within a group must be unique
- `threshold` must be between `1` and the number of selected approvers
- one group may select at most 256 approvers
- declared algorithms must exist in the runtime artifact
- public keys must decode under their declared algorithms
- public key material must be distinct across named approvers

Key-bound and policy-bound groups share the same request format, hash, proof array, timestamp, and nonce. Combined enforcement requires every group from both sources. See [Four Eye Control](../security-model/four-eye-control.md) for the signed request format and replay rules.

### Strict CEL roots

TKeeper compiles each authority policy with the root schema produced by its intent type and trusted config.

- intent roots and their CEL types come from the selected authority type
- `policy.variables` add constant root values
- policy variables cannot reuse an intent root name
- any external root missing from the intent schema rejects the authority during key creation or import
- compilation errors identify the policy, rule, and expression location
- nested key access must follow the type exposed by the intent schema

For example, `purpoze == 'payment'` fails authority creation when the custom schema declares `purpose`. Native schemas similarly reject misspelled roots such as `chainID` when the EVM intent exposes `chainId`.

See [CEL functions](cel-functions.md) for the standard macros and installed `effect`, decimal, bigint, list, network, semver, crypto, and time helpers.

The audit event stores the policy decision and matched rules.

For a policy-checked sign request, the audit event always carries the Verdict policy evaluation.

## OCI artifacts

An authority OCI artifact contains one authority document:

- `authority.json`
- `authority.yaml`
- `authority.yml`

Use digest-pinned references:

```text
oci://registry.example/verdict/authorities/production-deployment@sha256:...
```

Tags are mutable. They are fine for local development, but not as a production trust anchor.

Allow every registry explicitly. The match includes the port, and an empty list denies OCI pulls:

```hocon
oras {
  allowed-registries = ["registry.example"]
}
```

For a local HTTP registry, allow that registry and enable insecure ORAS access:

```hocon
oras {
  allowed-registries = ["registry:5000"]
  insecure = true
}
```

## Custom typed authorities

Use `custom` when the request is JSON and no native intent exists. The [custom authority example](#custom-authority-example) above includes a configured authority and matching command.

Only declared fields become CEL variables. Unknown JSON fields are rejected before signing. `effects` is reserved.

This has an important integration consequence: a backend must not act on unknown fields that were invisible to policy. Reject extra fields before calling TKeeper, or construct the executed action exclusively from declared, governed fields.

Schema evolution should be explicit. Changing field meaning, effect mapping, or policy requires a new reviewed artifact digest; the human-readable `version` field is not a trust anchor.

Supported custom field types and validation rules are documented in [Arbitrary and Typed Authorities](arbitrary-and-typed.md). CEL helpers are documented in [CEL functions](cel-functions.md).

## Common problems

### Key with `arbitrary` plus another authority is rejected

`arbitrary` means raw signing. Mixing it with concrete authorities makes the key ambiguous.

### `INVALID_AUTHORITY`

The authority list is invalid, the OCI reference is malformed, the authority id is duplicated, the loaded document id does not match the configured id, or the authority policy is invalid.

### `INVALID_AUTHORITY_ARTIFACT`

The command artifact type does not match the authority type, or the feature module for that intent is missing.

### `AUTHORITY_VIOLATION`

The command selected an authority id that is not attached to the key identity. This also applies when an `arbitrary` command is sent to a key that does not allow `arbitrary`.

### `INVALID_INTENT`

The command payload could not be decoded into the authority intent. Common causes are malformed transactions, missing previous Bitcoin transactions, unknown EVM contracts, or invalid typed JSON.

### `POLICY_VIOLATION`

The Verdict policy evaluated to `DENY`.

### OCI pull fails with TLS errors

Check that the exact host and port are present in `oras.allowed-registries`. A local HTTP registry also needs `oras.insecure = true`.
