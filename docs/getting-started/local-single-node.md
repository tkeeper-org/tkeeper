# Local Single Node

Run a local node, create a key, sign `hello`, and verify the signature. The setup uses:

- one node
- `mono` key mode
- Shamir seal provider with `1-of-1` unseal shares
- developer token authentication
- the `arbitrary` authority for raw signing

Keep this configuration local. It uses a fixed developer token and no TLS. For production setup, see [Deployment](../deployment/README.md).

## What this proves

The flow checks initialization, unseal, key creation, signing, and verification:

```text
request -> raw-signing identity -> signature -> verification
```

To check intent policy, replace `arbitrary` with a `custom` or protocol-specific authority after completing this flow.

## Requirements

- Java 25
- a built TKeeper jar
- `curl`

Build the jar with the explicit developer-auth feature:

```bash
./gradlew :build -Pkeeper.features=all,auth-dev -Pkeeper.platforms=all
```

The jar is:

```text
build/libs/tkeeper-2.5.1.jar
```

## Create local config

Create `/tmp/tkeeper/application.conf`:

```hocon
auth { type = "dev" }

boot { token = "local-boot-token" }

keeper {
  database { path = "/tmp/tkeeper/db" }

  authority { arbitrary { enabled = true } }

  providers {
    selected = "shamir"
    shamir {
      threshold = 1
      total = 1
    }
  }

  server {
    public {
      host = "0.0.0.0"
      port = 8080
    }
    internal {
      host = "0.0.0.0"
      port = 9090
    }
  }
}
```

Create `/tmp/tkeeper/dev.conf`:

```hocon
keeper.dev {
  token = "dev-token"
  permissions = [
    "tkeeper.system.init",
    "tkeeper.system.unseal",
    "tkeeper.system.seal",
    "tkeeper.dkg.create",
    "tkeeper.key.*.public",
    "tkeeper.key.*.sign",
    "tkeeper.key.*.verify",
    "tkeeper.compliance.inventory"
  ]
}
```

The example token and bootstrap token are local credentials. Use [JWT authentication](../security-model/authentication-authorization.md#jwt-authentication) and permissions scoped to the required keys for a production integration.

## Run TKeeper

```bash
java \
  --enable-native-access=ALL-UNNAMED \
  -Dkeeper.config.location=/tmp/tkeeper \
  -Dkeeper.dev.enabled=true \
  -Dkeeper.dev.config.location=/tmp/tkeeper \
  -Dkeeper.coordinator.enabled=true \
  -jar build/libs/tkeeper-2.5.1.jar
```

## Initialize the node

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{"peerId":1,"threshold":1,"total":1}' \
  http://localhost:8080/v1/keeper/system/init
```

With the Shamir provider, the response contains `shares64`. Save the share outside the node. You need it to unseal TKeeper after initialization or restart.

## Unseal

Replace `share-from-init` with one value from the `shares64` response.

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{"payload64":"share-from-init"}' \
  http://localhost:8080/v1/keeper/system/unseal
```

## Create a demo key identity

This creates a local `SECP256K1` identity that can authorize `arbitrary` signing requests.

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyId": "demo-identity",
    "algorithm": "SECP256K1",
    "mode": "CREATE",
    "authorities": [
      { "id": "arbitrary" }
    ]
  }' \
  http://localhost:8080/v2/keeper/dkg
```

See [Authorities](../signing-and-authorities/authorities.md) to create a key with intent policy.

## Sign

This signs `hello`, base64-encoded as `aGVsbG8=`.

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyId": "demo-identity",
    "command": {
      "type": "arbitrary",
      "authorityId": "arbitrary",
      "artifact": {
        "scheme": "ECDSA",
        "hash": "SHA256",
        "data64": "aGVsbG8="
      }
    }
  }' \
  http://localhost:8080/v2/keeper/sign
```

The response contains the Base64 signature and key generation:

```json
{
  "signature64": "...",
  "type": "ECDSA",
  "generation": 1,
  "imposters": []
}
```

## Verify

Replace `signature-from-sign-response` with `signature64` from the sign response.

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyId": "demo-identity",
    "command": {
      "type": "arbitrary",
      "artifact": {
        "scheme": "ECDSA",
        "hash": "SHA256",
        "data64": "aGVsbG8="
      }
    },
    "signature64": "signature-from-sign-response"
  }' \
  http://localhost:8080/v2/keeper/sign/verify
```

Expected response:

```json
{ "valid": true }
```

`valid: true` confirms that the signature matches the message and key. Verification does not evaluate authority policy. An executing application must also check the expected key, action, expiry, and replay rules.

## Turn the smoke test into a governed integration

- Define the action schema and effects, then use [Authorities](../signing-and-authorities/authorities.md) to replace `arbitrary` with a structured authority.
- Make the downstream service reject the action unless proof for the exact governed intent verifies.
- Use [Quorum Modes](../security-model/quorum-modes.md) before creating high-risk keys.
- Use [Build and Features](../deployment/build-and-features.md) to select only the features and platforms your deployment needs.
- Use [Authentication and Authorization](../security-model/authentication-authorization.md) before leaving local development.
