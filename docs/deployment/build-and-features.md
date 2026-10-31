# Build and features

TKeeper has two build-time selectors:

- `keeper.features`: command types, endpoints, ECIES, and seal providers
- `keeper.platforms`: cryptographic algorithms and protocols

A usable production artifact must include at least one platform.

## Build default production modules

```bash
./gradlew build -Pkeeper.features=all -Pkeeper.platforms=all
```

`build` runs the root, SDK, and selected module unit tests, then produces a deployable jar through `shadowJar`.

Equivalent:

```bash
./gradlew :build -Pkeeper.features.all=true -Pkeeper.platforms.all=true
```

The jar lands under:

```text
build/libs/tkeeper-3.1.0.jar
```

TKeeper requires Java 25.

Packaging checks the selected modules and required security components before the
Docker image is built. See [Build-time security](../security-model/build-time-security.md)
for artifact selection and deployment checks.

## Build a smaller artifact

To include EVM signing and ECIES:

```bash
./gradlew :build -Pkeeper.features=evm,ecies -Pkeeper.platforms=ecc
```

To include only ML-DSA:

```bash
./gradlew :build -Pkeeper.platforms=pqc
```

Use `evm` to include EVM transactions.
Use `digital-assets` for Bitcoin, EVM, Tron, XRP, Solana, and XLM, and `agentic-payments` for both AP2 and MC VI:

```bash
./gradlew :build -Pkeeper.features=agentic-payments,digital-assets -Pkeeper.platforms=ecc
```

## Select a native OS/CPU target

`keeper.platforms` selects cryptographic modules (`ecc` and `pqc`). The separate `target`
property selects native libraries packaged into the **production** fat jar. By default,
`target=all` keeps native binaries for every bundled OS/CPU combination and produces
`build/libs/tkeeper-3.1.0.jar`.

Build the complete feature set for a Linux amd64 host with a smaller jar:

```bash
./gradlew shadowJar -Pkeeper.features=all -Pkeeper.platforms=all -Ptarget=linux-amd64
```

The output is `build/libs/tkeeper-3.1.0-linux-amd64.jar`. To keep every bundled native variant, use
`-Ptarget=all` or omit `target`:

```bash
./gradlew shadowJar -Pkeeper.features=all -Pkeeper.platforms=all -Ptarget=all
```

| `target` | Output classifier |
| --- | --- |
| `all` (default) | none |
| `linux-amd64` | `linux-amd64` |
| `linux-arm64` | `linux-arm64` |
| `macos-amd64` | `macos-amd64` |
| `macos-aarch64` | `macos-aarch64` |
| `windows-amd64` | `windows-amd64` |

A targeted jar contains native libraries for the selected OS/CPU. Java classes and
features stay the same. Both test jars retain every bundled native variant regardless
of `target`.

Before services are created, Keeper loads GMP, libsodium, RocksDB JNI, and secp256k1
when `ecc` is selected. Packaging records their SHA-256 digests and checks the final
jar against that inventory. Startup verifies each extracted library before loading it.

System loading is turned off by default. On Linux arm64 and macOS amd64, no crypto
natives are bundled: install GMP, libsodium, and (for `ecc`) secp256k1, then explicitly
allow their use with `-Dkeeper.native.allow-system=true`. Set `-Djava.library.path`
to their directory if needed. RocksDB requires a compatible JNI library
when its embedded variant is unavailable. System libraries are trusted without digest
verification. The flag permits fallback only when the compiled inventory has no
matching embedded variant and no unlisted resource is present. A missing, changed,
unreadable, or unloadable expected binary aborts startup even with the flag enabled.

The production Dockerfile provides the system crypto libraries and sets the JVM
library path. A standalone jar does not install them. For the loading smoke task,
pass `-Pkeeper.native.allow-system=true` to forward the explicit opt-in to its JVM.
Linux targets use glibc binaries. For musl-based distributions, use `target=all` and
verify the remaining native dependencies. A targeted jar is specific to its OS/CPU.

`shadowJar` checks that the targeted archive contains the required runtime classes
and native libraries and excludes other targets. Run the loading check on the target
host as well. Archive validation cannot detect host library-loading failures.

On the target host, load the native libraries from the built jar with:

```bash
./gradlew smokeTargetJar -Pkeeper.features=all -Pkeeper.platforms=all -Ptarget=linux-amd64
```

This checks the JVM OS/CPU against `target`, then loads RocksDB, GMP, libsodium, and
secp256k1 when `ecc` is selected. It fails if a required library cannot load. For
Linux arm64 or macOS amd64, provide these system libraries in the JVM library path.
Set `JAVA_TOOL_OPTIONS=-Djava.library.path=/path/to/libs` for a standalone
run. A cross build needs this smoke command run on the target OS/CPU. It cannot validate
native loading on the build host.

## Feature and platform matrix

| Need | Feature selector | Platform selector |
| --- | --- | --- |
| EVM transaction authority | `evm` or `digital-assets` | `ecc` |
| Bitcoin transaction authority | `bitcoin` or `digital-assets` | `ecc` |
| Tron transaction authority | `tron` or `digital-assets` | `ecc` |
| XRP transaction authority | `xrp` or `digital-assets` | `ecc` |
| Solana transaction authority | `solana` or `digital-assets` | `ecc` |
| XLM and Soroban authority | `xlm` or `digital-assets` | `ecc` |
| AP2 payment authority | `ap2` or `agentic-payments` | `ecc` |
| MC VI payment authority | `mc-vi` or `agentic-payments` | `ecc` |
| X.509 certificate authority | `x509` | `ecc` |
| ECIES | `ecies` | `ecc` |
| Deferred operations authorized by a mandate | `mandate` (explicit opt-in, excluded from `all`) | any required crypto platform |
| Peer share recovery | `recovery` (explicit opt-in) | `ecc`, `pqc`, or both |
| AWS KMS seal provider | `seal-aws` | any required crypto platform |
| Google Cloud KMS seal provider | `seal-gcloud` | any required crypto platform |
| Developer token authentication | `auth-dev` (explicit opt-in, excluded from `all`) | any required crypto platform |
| Authority policy dry run | `dry-run` (explicit opt-in, excluded from `all`) | any required crypto platform |
| ML-DSA identities | none | `pqc` |
| Default production set | `all` | `all` |

Include the platform required by each selected feature and key algorithm.

Recovery is an explicit artifact capability. Selecting it adds the base recovery API and the
recovery module for each selected platform:

```bash
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=pqc
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc,pqc
```

These commands build recovery for ECC, ML-DSA, or both. Select `recovery` once.
The selected platforms determine which recovery protocols are included. Recovery,
`auth-dev`, `dry-run`, and `mandate` are excluded from `keeper.features=all`.

Treat this as a maintenance artifact. After recovery, rebuild and redeploy the normal production
artifact without the `recovery` selector. Setting `keeper.recovery=false` alone leaves the recovery
code and routes in the artifact.

To include developer authentication, select `auth-dev` explicitly:

```bash
./gradlew :build -Pkeeper.features=auth-dev -Pkeeper.platforms=ecc
```

Build the dry-run endpoint explicitly in the same way:

```bash
./gradlew :build -Pkeeper.features=dry-run -Pkeeper.platforms=ecc
```

Use [TKeeper Hub](https://tkeeper.org/hub) to connect AI agents through MCP. Hub runs
separately from Keeper and uses its core [configuration and identity catalog APIs](../api-reference/configuration.md).

## Selection properties

| Scope | Features | Platforms |
| --- | --- | --- |
| Runtime jar | `keeper.features` | `keeper.platforms` |
| Docker build | `keeper.docker.features` | `keeper.docker.platforms` |
| Select all | `keeper.features.all=true` | `keeper.platforms.all=true` |

Comma-separated selectors accept short names such as `ecies`, `ecc`, and `pqc`. `all` selects every
default production module in that category. Explicit features such as `recovery`, `auth-dev`, `dry-run`, and `mandate` are
not included.

`target` is independent of these selectors. Invalid target names fail the Gradle build
instead of silently producing a jar with mismatched native libraries.

## Docker

Build the production Docker image:

```bash
./gradlew dockerBuild -Pkeeper.features=all -Pkeeper.platforms=all
```

For a Linux amd64 or arm64 image, pass `-Ptarget=linux-amd64` or
`-Ptarget=linux-arm64`. The Docker build uses the matching `--platform` and the
matching production jar. `target=all` preserves the existing Docker build with the
multi-target native jar. macOS and Windows targets cannot be used with `dockerBuild` because the
Dockerfile produces Linux images.

`dockerBuild` also loads the jar's native libraries inside the target image before
finishing. For `linux-arm64` on an amd64 host, Docker must be able to execute arm64
build steps (such as an arm64 builder or emulation).

Images default to refusing system fallback too. Linux arm64 images need an explicit
opt-in for their system crypto libraries:

```bash
./gradlew dockerBuild -Pkeeper.platforms=ecc -Ptarget=linux-arm64 -Pkeeper.native.allow-system=true
```

This passes `TKEEPER_ALLOW_SYSTEM_LIBRARIES=true` to the Docker build and records
`-Dkeeper.native.allow-system=true` in the image's default JVM options. Protect the
image and its system libraries as trusted deployment inputs.

Build a recovery image with both platform implementations:

```bash
./gradlew dockerBuild \
  -Pkeeper.docker.features=recovery \
  -Pkeeper.docker.platforms=ecc,pqc
```

Production image tags:

```text
exploit/tkeeper:3.1.0
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
  exploit/tkeeper:3.1.0
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

The test task reuses these images. Re-run the build after changing app code, dependencies, or Dockerfiles.

Both test-image builds use Docker's selected platform. They enable
`keeper.native.allow-system` automatically only for `linux/arm64`, which lacks
bundled crypto natives and uses the libraries built into the image. Other platforms
keep system fallback turned off by default. Bundled variants still take priority and
fail closed on verification or loading errors. Pass
`-Pkeeper.native.allow-system=true|false` to override the test-image default.
Production image builds keep system fallback turned off by default on every platform.

Do not pass `keeper.features` or `keeper.platforms` to this task. The development integration image
uses a dedicated classpath containing every default production feature, the explicit `auth-dev`,
`dry-run`, `mandate`, and `recovery` features, both recovery platform modules, every platform, and the test-only
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

Rebuild with the required platform:

```bash
./gradlew :build -Pkeeper.features=evm -Pkeeper.platforms=ecc
```

### Native access warning

Add:

```text
--enable-native-access=ALL-UNNAMED
```

The Docker image already does this.
