# Build and Features

TKeeper has two build-time selectors:

- features: product surface such as authorities, ECIES, UI, and seal providers
- platforms: cryptographic algorithms and protocols

A usable production artifact must include at least one platform.

## Build default production modules

```bash
./gradlew build -Pkeeper.features=all -Pkeeper.platforms=all
```

`build` runs the root and SDK tests plus the unit tests of every selected feature and platform module before producing the artifact.

The root `build` task runs the normal verification lifecycle and produces the deployable fat jar through `shadowJar`.

Equivalent:

```bash
./gradlew :build -Pkeeper.features.all=true -Pkeeper.platforms.all=true
```

The jar lands under:

```text
build/libs/tkeeper-2.5.0.jar
```

TKeeper requires Java 25.

## Build a smaller artifact

Example: EVM signing, ECIES, and the UI:

```bash
./gradlew :build -Pkeeper.features=evm,ecies,ui -Pkeeper.platforms=ecc
```

Example: ML-DSA only:

```bash
./gradlew :build -Pkeeper.platforms=pqc
```

Feature names match child project names. `:features:digital-assets:evm` is selected with `evm`.
Use `digital-assets` for Bitcoin, EVM, Tron, XRP, and Solana, and `agentic-payments` for both AP2 and MC VI:

```bash
./gradlew :build -Pkeeper.features=agentic-payments,digital-assets -Pkeeper.platforms=ecc
```

The earlier `authority-bitcoin` and `authority-evm` selectors remain accepted.

## Feature and platform matrix

| Need | Feature selector | Platform selector |
| --- | --- | --- |
| EVM transaction authority | `evm` or `digital-assets` | `ecc` |
| Bitcoin transaction authority | `bitcoin` or `digital-assets` | `ecc` |
| Tron transaction authority | `tron` or `digital-assets` | `ecc` |
| XRP transaction authority | `xrp` or `digital-assets` | `ecc` |
| Solana transaction authority | `solana` or `digital-assets` | `ecc` |
| AP2 payment authority | `ap2` or `agentic-payments` | `ecc` |
| MC VI payment authority | `mc-vi` or `agentic-payments` | `ecc` |
| X.509 certificate authority | `authority-x509` | `ecc` |
| ECIES | `ecies` | `ecc` |
| Peer share recovery | `recovery` (explicit opt-in) | `ecc`, `pqc`, or both |
| Control-plane UI | `ui` | any required crypto platform |
| AWS KMS seal provider | `seal-aws` | any required crypto platform |
| Google Cloud KMS seal provider | `seal-gcloud` | any required crypto platform |
| Developer token authentication | `auth-dev` (explicit opt-in, excluded from `all`) | any required crypto platform |
| Authority policy dry run | `dry-run` (explicit opt-in, excluded from `all`) | any required crypto platform |
| MCP discovery, utilities, signing, and composition | `mcp` (explicit opt-in, excluded from `all`) | any required crypto platform |
| ML-DSA identities | none | `pqc` |
| Default production set | `all` | `all` |

Features with platform dependencies require the matching platform. The build should fail early instead of producing an artifact with a missing runtime provider.

Recovery is an explicit artifact capability. Selecting it adds the base recovery API and the
recovery module for each selected platform:

```bash
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=pqc
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc,pqc
```

The first command includes `:features:recovery` and `:features:recovery:ecc`; the second includes
`:features:recovery` and `:features:recovery:pqc`; the third includes all three. The platform modules
are not selected separately. Recovery, `auth-dev`, `dry-run`, and `mcp` are excluded from `keeper.features=all` and
must be requested explicitly.

Treat this as a maintenance artifact. After recovery, rebuild and redeploy the normal production
artifact without the `recovery` selector; setting `keeper.recovery=false` alone leaves the recovery
code and routes in the artifact.

`auth-dev` is deliberately excluded from `all`, but it may be included in any deployable artifact by requesting it explicitly:

```bash
./gradlew :build -Pkeeper.features=auth-dev -Pkeeper.platforms=ecc
```

Build the dry-run endpoint explicitly in the same way:

```bash
./gradlew :build -Pkeeper.features=dry-run -Pkeeper.platforms=ecc
```

Build the MCP endpoint into the same public Keeper server:

```bash
./gradlew :build -Pkeeper.features=mcp,digital-assets -Pkeeper.platforms=ecc
```

The endpoint is `POST /mcp` and uses the configured Keeper authentication provider. See
[MCP connection and tools](../signing-and-authorities/mcp.md) for setup and request format.

## Selection properties

| Scope | Features | Platforms |
| --- | --- | --- |
| Runtime jar | `keeper.features` | `keeper.platforms` |
| Docker build | `keeper.docker.features` | `keeper.docker.platforms` |
| Select all | `keeper.features.all=true` | `keeper.platforms.all=true` |

Comma-separated selectors accept short names such as `ecies`, `ecc`, and `pqc`. `all` selects every
default production module in that category. Explicit features such as `recovery`, `auth-dev`, `dry-run`, and `mcp` are
not included.

## Docker

Build the production Docker image:

```bash
./gradlew dockerBuild -Pkeeper.features=all -Pkeeper.platforms=all
```

Build a recovery image with both platform implementations:

```bash
./gradlew dockerBuild \
  -Pkeeper.docker.features=recovery \
  -Pkeeper.docker.platforms=ecc,pqc
```

Production image tags:

```text
exploit/tkeeper:2.5.0
exploit/tkeeper:latest
```

The Dockerfile adds the JVM flag required by the FFI Java API:

```text
--enable-native-access=ALL-UNNAMED
```

Run the image:

```bash
docker run --rm \
  -p 8080:8080 \
  -p 9090:9090 \
  -v "$PWD/config:/etc/tkeeper:ro" \
  -v "$PWD/data:/var/lib/tkeeper" \
  -e KEEPER_CONFIG_LOCATION=/etc/tkeeper \
  exploit/tkeeper:2.5.0
```

## Integration image

Run the complete release verification with:

```bash
./gradlew releaseGate
```

This includes every module's unit tests, artifact isolation, both test-container builds, and the functional integration suite. Performance benchmarks are separate.

Build both images used by functional integration tests with:

```bash
./gradlew buildTestContainers
```

The test task reuses these images. Re-run the build after changing application code, dependencies, or Dockerfiles.

Do not pass `keeper.features` or `keeper.platforms` to this task. The development integration image
uses a dedicated classpath containing every default production feature, the explicit `auth-dev`,
`dry-run`, and `recovery` features, both recovery platform modules, every platform, and the test-only
failure-injection module.

Never deploy either test image as production runtime.

## Common failures

### Feature endpoint returns 404

The feature was not included in the artifact.

Rebuild with the required feature and platform.

For recovery, select the base feature and the required platforms:

```bash
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc,pqc
```

### No provider for algorithm

The platform was not included in the artifact.

Rebuild with the required platform, for example:

```bash
./gradlew :build -Pkeeper.features=evm -Pkeeper.platforms=ecc
```

### Native access warning

Add:

```text
--enable-native-access=ALL-UNNAMED
```

The Docker image already does this.
