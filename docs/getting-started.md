# Getting Started

This is the smallest useful flow.

It runs one node, uses dev auth, initializes it with Shamir seal shares, creates an arbitrary key, signs bytes, and verifies the signature.

For a real threshold cluster, run one keeper per peer and keep `threshold` and `total` identical on every peer.

## Build

```bash
./gradlew shadowJar -Pkeeper.features=all
```

The jar is:

```text
build/libs/tkeeper-2.0.0.jar
```

TKeeper needs Java 25.

## Config

`/tmp/tkeeper/application.conf`:

```hocon
auth { type = "dev" }

boot { token = "local-boot-token" }

keeper {
  database { path = "/tmp/tkeeper/db" }

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

`/tmp/tkeeper/dev.conf`:

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

## Run

```bash
java \
  --enable-native-access=ALL-UNNAMED \
  -Dkeeper.config.location=/tmp/tkeeper \
  -Dkeeper.dev.enabled=true \
  -Dkeeper.dev.config.location=/tmp/tkeeper \
  -Dkeeper.coordinator.enabled=true \
  -jar build/libs/tkeeper-2.0.0.jar
```

## Initialize

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{"peerId":1,"threshold":1,"total":1}' \
  http://localhost:8080/v1/keeper/system/init
```

With Shamir, the response contains `shares64`. Save them outside the node.

## Unseal

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{"payload64":"share-from-init"}' \
  http://localhost:8080/v1/keeper/system/unseal
```

## Create Key

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyId": "demo-key",
    "curve": "SECP256K1",
    "mode": "CREATE",
    "authorities": [
      { "id": "arbitrary" }
    ]
  }' \
  http://localhost:8080/v2/keeper/dkg
```

`authorities` is a JSON array of key authorities.

## Sign

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyId": "demo-key",
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

The response contains `signature64`, `type`, `generation`, `code`, and `imposters`.

## Verify

```bash
curl -s \
  -H 'X-DEV-TOKEN: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyId": "demo-key",
    "command": {
      "type": "arbitrary",
      "authorityId": "arbitrary",
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

Response:

```json
{ "valid": true }
```
