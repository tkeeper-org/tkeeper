# Sealing & Unsealing

TKeeper starts sealed. While sealed, most public endpoints reject the request with `KEEPER_SEALED`.

Manual unseal:

```http
POST /v1/keeper/system/unseal
```

One share:

```json
{
  "payload64": "..."
}
```

Several shares:

```json
{
  "payloads64": ["...", "..."]
}
```

Reset in-progress unseal first:

```json
{
  "payloads64": ["...", "..."],
  "reset": true
}
```

Shamir unseal progress:

```json
{
  "threshold": 2,
  "total": 3,
  "progress": 1,
  "ready": false
}
```

When enough shares are submitted, `ready` becomes `true`.

Seal again:

```http
POST /v1/keeper/system/seal
```

Required permissions:

```text
tkeeper.system.unseal
tkeeper.system.seal
```

Seal providers:

| Provider | Where it lives |
| --- | --- |
| `shamir` | core |
| `hsm` | core |
| `aws` | `feature-seal-aws` |
| `google` | `feature-seal-gcloud` |

Feature seal providers must be included at build time. If `keeper.providers.selected = "aws"` but the jar was built without `feature-seal-aws`, startup will not find the provider.

## Provider Selection

Provider selection lives under `keeper.providers`:

```hocon
keeper.providers {
  selected = "shamir"
  auto-unseal = false
}
```

`auto-unseal` applies to automatic providers. Manual Shamir unseal uses submitted shares.

For automatic providers, `GET /v1/keeper/system/unseal` asks the selected provider to decrypt TKeeper's internal master key. That is how HSM, AWS KMS, and Google Cloud KMS unseal without submitted shares.

## Shamir Provider

`shamir` is built in.

Config:

```hocon
keeper.providers {
  selected = "shamir"

  shamir {
    total = 5
    threshold = 3
  }
}
```

Behavior:

- `/v1/keeper/system/init` returns Shamir unseal shares
- `POST /v1/keeper/system/unseal` accepts one or more shares
- `GET /v1/keeper/system/unseal` is not supported for manual Shamir

## HSM Provider

`hsm` is built in. It uses PKCS#11 through `SunPKCS11`.

Config:

```hocon
keeper.providers {
  selected = "hsm"
  auto-unseal = true

  hsm {
    name = "softhsm"
    library = "/usr/lib/softhsm/libsofthsm2.so"
    key-alias = "tkeeper-kek"
    pin = "1234"
    cipher = "AES_GCM"

    slot-list-index = 0
    extra-attributes = []
  }
}
```

Supported ciphers:

```text
AES_GCM
AES_CBC
```

`slot` and `slot-list-index` are mutually exclusive.

## AWS KMS Provider

`aws` lives in `feature-seal-aws`.

Build with it:

```bash
./gradlew shadowJar -Pkeeper.features=seal-aws
```

Config:

```hocon
keeper.providers {
  selected = "aws"
  auto-unseal = true

  aws {
    key-id = "arn:aws:kms:eu-central-1:123456789012:key/..."
    region = "eu-central-1"
  }
}
```

## Google Cloud KMS Provider

`google` lives in `feature-seal-gcloud`.

Build with it:

```bash
./gradlew shadowJar -Pkeeper.features=seal-gcloud
```

Config:

```hocon
keeper.providers {
  selected = "google"
  auto-unseal = true

  google {
    project = "my-project"
    location = "global"
    key-ring = "tkeeper"
    crypto-key = "seal-key"
  }
}
```

## Frequent Problems

### `KEEPER_SEALED`

Unseal the node first:

```http
POST /v1/keeper/system/unseal
```

### Auto-unseal provider is selected but missing

Rebuild the jar with the provider feature.

### Google provider is not found

The provider id is `google`, not `gcloud`. The build feature name is still `seal-gcloud`.
