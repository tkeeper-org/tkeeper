# Sealing & unsealing

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

Select a provider and include its build feature when required:

| Provider | Unseal method | Build feature |
| --- | --- | --- |
| `shamir` | submit unseal shares | built in |
| `hsm` | PKCS#11 wrapping key | built in |
| `aws` | AWS KMS key | `seal-aws` |
| `google` | Google KMS key | `seal-gcloud` |

A selected provider must be present in the artifact. `keeper.providers.selected = "aws"` requires `-Pkeeper.features=seal-aws`.

## Provider selection

Configure the selected provider under `keeper.providers`:

```hocon
keeper.providers {
  selected = "shamir"
  auto-unseal = false
}
```

`auto-unseal` applies to automatic providers. Manual Shamir unseal uses submitted shares.

For automatic providers, `GET /v1/keeper/system/unseal` asks the selected provider to decrypt TKeeper's internal master key. That is how HSM, AWS KMS, and Google KMS unseal without submitted shares.

## Shamir provider

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

## HSM provider

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

## AWS KMS provider

Use provider id `aws` with the `seal-aws` feature.

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

## Google KMS provider

Use provider id `google` with the `seal-gcloud` feature.

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

## KMS credentials and access

KMS encrypt and decrypt requests use HTTPS. Provide the selected cloud identity with access to
the configured key, and test unsealing in the deployment environment before relying on auto-unseal.

AWS uses its [default credential chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html).
It supports environment variables, shared profiles, web identity, container credentials, and EC2
instance credentials. For IAM Identity Center (SSO), obtain a session with the AWS command-line tool
before starting Keeper. The identity needs `kms:Encrypt` and `kms:Decrypt`, with access allowed
by the key policy.

Google uses [default credentials](https://cloud.google.com/docs/authentication/application-default-credentials):
`GOOGLE_APPLICATION_CREDENTIALS`, the local ADC file, or the attached service account.
Service accounts, user credentials, workload federation, and impersonation are supported.
The identity needs `cloudkms.cryptoKeyVersions.useToEncrypt` and
`cloudkms.cryptoKeyVersions.useToDecrypt`. Requests use the `cloud-platform` OAuth 2.0 scope and
include quota-project metadata when the credentials supply it.

Keeper refreshes credentials when required. Transient KMS HTTP errors receive up to three attempts.
Redirects are rejected. Google KMS responses must pass checksum verification and use a version
of the configured key. If KMS cannot decrypt the master key, unsealing fails and the node remains sealed.

## Common problems

### `KEEPER_SEALED`

Unseal the node first:

```http
POST /v1/keeper/system/unseal
```

### Auto-unseal provider is selected but missing

Rebuild the jar with the provider feature.

### Google provider is not found

The provider id is `google`, not `gcloud`. The build feature name is still `seal-gcloud`.
