# Authorities

Authorities bind a key to the kind of effect it may produce.

With authorities, TKeeper checks the requested effect before it starts threshold signing.

Full Verdict syntax lives here:

[github.com/exploit-org/verdict](https://github.com/exploit-org/verdict)

## Key Authorities

A key stores a list of authorities.

Concrete authorities use OCI references:

```json
[
  {
    "id": "payments-small",
    "oci": "oci://registry.example/verdict/authorities/payments-small@sha256:..."
  },
  {
    "id": "evm-mainnet-usdc",
    "oci": "oci://registry.example/verdict/authorities/evm-mainnet-usdc@sha256:..."
  }
]
```

`arbitrary` is for raw data signing:

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
- `arbitrary` does not use an OCI reference
- `arbitrary` cannot be mixed with concrete authorities on the same key
- non-arbitrary authorities require an OCI reference
- concrete authorities must be digest-pinned with `@sha256:...`
- tags are for local development, not production trust anchors
- authority ids must be unique on the same key

## Authority Document

Concrete authorities are Verdict authority documents.

```yaml
schemaVersion: verdict.authority/v1
id: evm-mainnet-usdc
type: evm.transaction
version: 1.0.0

metadata:
  title: Mainnet USDC policy

config:
  chainId: 1
  contracts:
    - standard: erc20
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

policy:
  id: usdc-transfer
  fallback: DENY
  allow:
    - id: allow-small-usdc-transfer
      where:
        - "effect.one(effects, 'erc20.transfer')"
        - "effect.any(effects, 'erc20.transfer', {'token': tokenAddress})"
        - "bigint.lte(effect.amount(effects, 'erc20.transfer'), maxAmount)"
  deny: []
  variables:
    tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
    maxAmount: "100000000"
```

Fields:

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

## Request Matching

For a concrete authority, the sign command must reference an authority attached to the key:

```json
{
  "keyId": "evm-treasury",
  "command": {
    "type": "evm.transaction",
    "authorityId": "evm-mainnet-usdc",
    "artifact": {
      "message64": "..."
    }
  }
}
```

The command `authorityId` must exist on the key.

The command `type` must match the authority document `type`.

The authority document `id` must match the key authority id.

If policy returns `ALLOW`, TKeeper starts threshold signing. If the policy returns `DENY`, signing does not start.

For `arbitrary`, TKeeper only checks that the key allows `arbitrary` and that the command artifact type is `arbitrary`. No Verdict policy is loaded.

## Intent Types

Authority `type` selects the payload format and policy context.

| Authority type | Build feature | Command data | Main policy surface |
| --- | --- | --- | --- |
| `custom` | core | typed JSON | declared fields and configured `effects` |
| `evm.transaction` | `authority-evm` | unsigned serialized EVM transaction | transaction fields, decoded call, `effects` |
| `bitcoin.transaction` | `authority-bitcoin` | unsigned tx, previous txs, signing input, sighash | inputs, outputs, fee, sighash, `effects` |
| `x509.tbs-certificate` | `authority-x509` | DER-encoded TBS certificate | subject, issuer, validity, extensions |
| `arbitrary` | core | raw bytes | no Verdict policy |

If a feature module is missing, TKeeper cannot process that command type and returns `INVALID_AUTHORITY_ARTIFACT`.

Build example:

```bash
./gradlew shadowJar -Pkeeper.features=authority-evm,authority-bitcoin,authority-x509
```

## Effects

Effects are normalized consequences exposed to CEL as `effects`.

Raw request fields explain the input. Effects describe what the input does.

Example effect:

```json
{
  "type": "erc20.transfer",
  "token": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "to": "0x2222222222222222222222222222222222222222",
  "amount": "1000000"
}
```

Common CEL pattern:

```cel
effect.onlyTypes(effects, ['erc20.transfer']) &&
effect.one(effects, 'erc20.transfer') &&
effect.any(effects, 'erc20.transfer', {
  'token': tokenAddress,
  'to': recipientAddress
}) &&
bigint.lte(effect.amount(effects, 'erc20.transfer'), maxAmount)
```

Native intent modules fail closed when they cannot describe a consequence.

Examples:

- EVM call to an unknown contract.
- EVM whitelisted function without an effect mapping.
- Bitcoin output script that cannot be classified.
- Bitcoin input without the previous transaction.

Typed JSON authorities produce only the effects declared in authority config.

## Policy Format

Verdict policies use `allow`, `deny`, and `fallback`:

```yaml
policy:
  id: policy-id
  fallback: DENY
  variables:
    maxAmount: "1000000"
  allow:
    - id: allow-example
      where:
        - "effect.one(effects, 'erc20.transfer')"
      unless:
        - "time.after(time.now(), expiresAt)"
  deny:
    - id: deny-example
      where:
        - "effect.has(effects, 'erc20.approval')"
```

Rules:

- policy id must be non-blank
- rule ids must be unique across `allow` and `deny`
- a rule matches when every `where` expression is `true`
- a rule does not match when any `unless` expression is `true`
- empty `where` and empty `unless` match unconditionally
- policy variables are available as root CEL variables
- policy variables override runtime variables with the same name
- deny matches override allow matches
- if no rule matches, `fallback` is returned

TKeeper allows signing only when the final decision is `ALLOW`.

The audit event stores the policy decision and matched rules.

For a policy-checked sign request, the audit event always carries the Verdict policy evaluation.

## OCI Artifacts

An authority OCI artifact contains one authority document:

- `authority.json`
- `authority.yaml`
- `authority.yml`

Use digest-pinned references:

```text
oci://registry.example/verdict/authorities/evm-mainnet-usdc@sha256:...
```

Tags are mutable. They are fine for local development, but not as a production trust anchor.

For a local HTTP registry, enable insecure ORAS access:

```hocon
oras.insecure = true
```

## Custom Typed Authority

Use `custom` when the request is JSON and no native intent exists.

Authority:

```yaml
schemaVersion: verdict.authority/v1
id: payments-small
type: custom
version: 1.0.0

config:
  fields:
    amount:
      type: bigint
    currency:
      type: string
    customer:
      type: object
      fields:
        id:
          type: string
  effects:
    - type: payment.transfer
      fields:
        asset: "$currency"
        amount: "$amount"
        customerId: "$customer.id"

policy:
  id: payments
  fallback: DENY
  allow:
    - id: small-usd-payment
      where:
        - "currency == 'USD'"
        - "effect.one(effects, 'payment.transfer')"
        - "bigint.lte(effect.amount(effects, 'payment.transfer'), '10000')"
  deny: []
```

Command:

```json
{
  "type": "custom",
  "authorityId": "payments-small",
  "artifact": {
    "scheme": "ECDSA",
    "hash": "SHA256",
    "typed": {
      "amount": 5000,
      "currency": "USD",
      "customer": {
        "id": "customer-42"
      }
    }
  }
}
```

Only declared fields become CEL variables. Unknown JSON fields are ignored. `effects` is reserved.

For all supported field types, effect mapping rules, and CEL helpers, use the Verdict docs:

[github.com/exploit-org/verdict](https://github.com/exploit-org/verdict)

## Frequent Problems

### Key with `arbitrary` plus another authority is rejected

`arbitrary` means raw signing. Mixing it with concrete authorities makes the key ambiguous.

### `INVALID_AUTHORITY`

The authority list is invalid, the OCI reference is malformed, the authority id is duplicated, the loaded document id does not match the configured id, or the authority policy is invalid.

### `INVALID_AUTHORITY_ARTIFACT`

The command artifact type does not match the authority type, or the feature module for that intent is missing.

### `INVALID_INTENT`

The command payload could not be decoded into the authority intent. Common causes are malformed transactions, missing previous Bitcoin transactions, unknown EVM contracts, or invalid typed JSON.

### `POLICY_VIOLATION`

The Verdict policy evaluated to `DENY`.

### OCI pull fails with TLS errors

Check `oras.insecure`. Local HTTP registry needs it set to `true`.
