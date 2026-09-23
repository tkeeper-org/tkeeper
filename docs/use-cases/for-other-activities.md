# For Other Activities

Use a `custom` authority when a service will execute a sensitive typed command after verifying a TKeeper signature. The authority declares input fields and policy effects. Raw `arbitrary` signing has no intent policy.

## Example: administrative change

This authority allows a normal rotation, reconciliation, or freeze tied to an approved change ticket:

```yaml
schemaVersion: verdict.authority/v1
id: test:custom/admin-ops
type: custom
version: 1.0.0
config:
  fields:
    purpose: { type: string }
    operation: { type: string }
    ticket: { type: string }
    emergency: { type: bool, required: false, default: false }
policy:
  id: test-custom-admin-ops
  fallback: DENY
  allow:
    - id: allow-normal-admin-change
      where:
        - "purpose == 'admin'"
        - "operation in ['rotate', 'reconcile', 'freeze']"
        - "ticket in ['INC-0001', 'INC-0002']"
      unless:
        - "emergency"
```

Attach the [authority document](../../integration-tests/src/testFixtures/resources/authorities/custom/admin-ops.yaml) by digest-pinned OCI reference to the administrative key. A matching command is:

```json
{
  "keyId": "admin-automation",
  "command": {
    "type": "custom",
    "authorityId": "test:custom/admin-ops",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "purpose": "admin",
        "operation": "rotate",
        "ticket": "INC-0001",
        "emergency": false
      }
    }
  }
}
```

Submit it to `POST /v2/keeper/sign` or through `action.sign` on MCP. The executing service verifies the signature against the expected key and exact command, then enforces its own ticket state and replay rules. Add target, environment, expiry, and nonce fields when they affect the action. The backend must not act on undeclared fields. [Typed signing material](../signing-and-authorities/arbitrary-and-typed.md#typed-json-signing-material) defines the byte representation used for verification.
