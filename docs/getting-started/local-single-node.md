# Local Single Node

This guide runs one local node with developer authentication, initializes it, creates one demo key identity, signs one request, and verifies the returned proof.

This is not a production deployment guide. It uses:

- one node
- `mono` key mode
- Shamir seal provider with `1-of-1` recovery
- developer token authentication
- the `arbitrary` authority only to demonstrate the sign/verify path

For real governed identities, use typed or concrete authorities so TKeeper can understand the requested action before signing it. `arbitrary` does not give TKeeper a structured intent or policy surface.

## What this proves

The local flow proves that configuration, initialization, sealing, key creation, signing, and verification work end to end:

```text
request -> raw-signing identity -> signature -> verification
```

It does not prove that TKeeper understands a business action or enforces intent policy. That begins when `arbitrary` is replaced by a `custom` or native typed authority.

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
build/libs/tkeeper-2.5.0.jar
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

This guide uses developer authentication locally. The feature may be selected for any build, but enabling it in production is an explicit operator risk decision and requires production-grade token protection and least-privilege permissions.

## Run TKeeper

```bash
java \
  --enable-native-access=ALL-UNNAMED \
  -Dkeeper.config.location=/tmp/tkeeper \
  -Dkeeper.dev.enabled=true \
  -Dkeeper.dev.config.location=/tmp/tkeeper \
  -Dkeeper.coordinator.enabled=true \
  -jar build/libs/tkeeper-2.5.0.jar
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

For production-like flows, attach a real authority document to the key, such as `custom`, `evm.transaction`, `bitcoin.transaction`, or `x509.tbs-certificate`. Those authorities let TKeeper parse the request into an understood intent and evaluate policy before signing.

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

The response contains the signature proof:

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

This verifies raw bytes. A production verifier must additionally trust the expected identity, bind the proof to the action it will execute, and enforce replay or expiry rules required by that action.

## Turn the smoke test into a governed integration

- Define the action schema and effects, then use [Authorities](../signing-and-authorities/authorities.md) to replace `arbitrary` with a structured authority.
- Make the downstream service reject the action unless proof for the exact governed intent verifies.
- Use [Quorum Modes](../security-model/quorum-modes.md) before creating high-risk keys.
- Use [Build and Features](../deployment/build-and-features.md) to select only the features and platforms your deployment needs.
- Use [Authentication and Authorization](../security-model/authentication-authorization.md) before leaving local development.
