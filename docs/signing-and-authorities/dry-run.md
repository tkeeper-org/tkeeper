# Dry Run Policy Evaluation

Dry run evaluates a command against the key's current authority policy and returns `ALLOW`, `DENY`, or `ALLOW_WITH_REQUIREMENTS`. Use it to inspect a decision before requesting a signature.

It does not execute the command, verify or consume approvals, or change key state. An allow decision is a preview of authority policy; the later signing request must still pass all signing controls.

## Enable the module

Dry run is an explicit build feature. It is excluded from `keeper.features=all` and must be selected by name:

```bash
./gradlew :build \
  -Pkeeper.features=dry-run \
  -Pkeeper.platforms=ecc
```

For a Docker image:

```bash
./gradlew dockerBuild \
  -Pkeeper.docker.features=dry-run \
  -Pkeeper.docker.platforms=ecc
```

See [Build and Features](../deployment/build-and-features.md) for feature and platform selection.

## Permission

The endpoint requires an authenticated caller with:

```text
tkeeper.emulate
```

This permission is not scoped to a key id. A successful response can expose policy matches, approver public keys, and approver metadata for any requested key known to the caller. Grant it only to services that are allowed to inspect authority-policy decisions.

## Java SDK

The Java SDK exposes dry-run evaluation through `TKeeperClient.dryRun()`.

```java
import org.exploit.tkeeper.sdk.model.Emulate;
import org.exploit.tkeeper.sdk.model.HashMethod;
import org.exploit.tkeeper.sdk.model.PolicyVerdict;
import org.exploit.tkeeper.sdk.model.SignatureSchemes;
import org.exploit.tkeeper.sdk.model.command.AuthorityCommand;
import org.exploit.tkeeper.sdk.model.command.artifact.TypedData;
import org.exploit.tkeeper.sdk.util.TKeeperJackson;

var payload = TKeeperJackson.signingNode()
        .put("purpose", "payments")
        .put("amount", 500)
        .put("currency", "USD");

var command = AuthorityCommand.of(
        "payments-small",
        new TypedData(SignatureSchemes.ECDSA, HashMethod.SHA256, payload)
);

var evaluation = keeper.dryRun().emulate(
        Emulate.of("payments-key", command)
);

if (evaluation.decision() == PolicyVerdict.DENY) {
    throw new IllegalStateException("authority policy denied the command");
}
```

The request uses the same `AuthorityCommand` shape as signing. The command's `authorityId` must be assigned to the key, and its artifact type must match that authority.

## Decisions

Dry run returns HTTP `200` for every completed policy evaluation, including denials.

| `decision` | Meaning |
| --- | --- |
| `ALLOW` | The authority policy currently allows the command without policy-driven approvals. |
| `ALLOW_WITH_REQUIREMENTS` | The authority policy allows the command after every returned approval group is satisfied. |
| `DENY` | The authority policy rejects the command. A real signing request would fail with `POLICY_VIOLATION`. |

`matches` contains the rules that contributed to the decision. `approvalRequirements` contains every authority-policy approval group required by the decision.

Example response requiring four-eye approval:

```json
{
  "decision": "ALLOW_WITH_REQUIREMENTS",
  "matches": [
    {
      "id": "review-large-payment",
      "effect": "ALLOW_WITH_REQUIREMENTS"
    }
  ],
  "approvalRequirements": [
    {
      "policyId": "payments-policy",
      "source": "review-large-payment",
      "threshold": 1,
      "approvers": {
        "operator": {
          "algorithm": "ED25519",
          "publicKey64": "...",
          "metadata": {
            "team": "payments"
          }
        }
      }
    }
  ]
}
```

Each approval requirement identifies the policy and matching rule or fallback in `source`, the required threshold, and the eligible approvers. See [Four-Eye Control](../security-model/four-eye-control.md) for constructing approvals for the later signing request.

## HTTP API

The SDK calls:

```text
POST /v1/keeper/emulate
```

Request body:

```json
{
  "keyId": "payments-key",
  "command": {
    "type": "custom",
    "authorityId": "payments-small",
    "artifact": {
      "scheme": "ECDSA",
      "hash": "SHA256",
      "typed": {
        "purpose": "payments",
        "amount": 500,
        "currency": "USD"
      }
    }
  }
}
```

The complete wire contract is in [`../../openapi.yaml`](../../openapi.yaml).
