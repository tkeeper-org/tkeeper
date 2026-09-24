# Integration tests

The integration suites run against multi-node TKeeper clusters managed by Testcontainers. Most functional tests use Docker Compose; production transport tests use an isolated generated-TLS topology.

## Requirements

- Java 25
- Docker Engine
- `docker-compose` or `docker compose`
- Colima on macOS; the Gradle harness configures its Docker socket

## Run suites

Run the complete release verification, including all module tests, artifact isolation, test-container builds, and functional tests:

```bash
./gradlew releaseGate
```

Performance benchmarks are intentionally excluded from `releaseGate`.

Build both required images from the repository root:

```bash
./gradlew buildTestContainers
```

This builds:

- `exploit/tkeeper:dev` contains default and explicit features, both recovery platform modules,
  and failure injection for the Compose suites;
- `exploit/tkeeper:production-it` uses the production UBI Dockerfile and a production-only ECC jar for transport security tests.

Run all functional tests:

```bash
./gradlew :integration-tests:functional:test
```

Functional tests do not rebuild the images. Re-run `buildTestContainers` after changing application code, dependencies, or Dockerfiles. Repeated and filtered test runs reuse the current images but always execute when requested.

Run one class with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.SignatureTests'
```

Performance tests are separate and do not use the automatic functional-suite image build:

```bash
./gradlew :integration-tests:performance:test
```

Do not pass `keeper.features` or `keeper.platforms`. The dedicated integration classpath always includes:

- every default production feature
- the explicit opt-in `:features:auth-dev`, `:features:dry-run`, `:features:mcp`, and `:features:recovery` modules
- both recovery platform modules
- `platform-ecc` and `platform-pqc`
- the test-only `:integration-tests:failure-injection` module

Regular `shadowJar` and `dockerBuild` artifacts do not include failure injection. Dry run and recovery
are included only when explicitly selected. Never deploy the integration image as a production runtime.

Verify that the production transport test artifact excludes `auth-dev`, `dry-run`, recovery, and
failure injection while the integration artifact contains all four:

```bash
./gradlew artifactIsolationTest
```

The functional suite is split by boundary:

| Class | Coverage |
| --- | --- |
| `SignatureTests` | ECC and ML-DSA signing and verification |
| `KeyLifecycleTests` | create, refresh, rotate, and PQC-specific lifecycle behavior |
| `AuthorityPolicyTests` | typed authority materialization and policy decisions |
| `DryRunTests` | opt-in policy evaluation, authentication, and fail-closed request validation |
| `FailureInjectionTests` | corruption, malicious signing packages, transcript mutations, ECC/PQC DKG and FROST/GG20/ML-DSA protocol-order violations, sequential replay, eight-way transition races, in-flight protocol restarts, demotion, and consistency repair |
| `RecoveryFailureInjectionTests` | production-TLS 3-of-5 ECC/PQC recovery, two differently damaged peers, explicit healthy helpers, mode restarts, full historical state rebuild, destroyed generations, transaction rollback, prefix isolation, and post-recovery signing |
| `ProductionTransportSecurityTests` | generated PKI, public HTTPS/JWT, HTTPS JWKS rotation, internal mTLS/SPKI, and fail-closed startup variants |
| `QuorumPromotionTests` | mono-to-threshold promotion |
| `KeyImportTests` | trusted-dealer import |
| `FourEyeControlTests` | approval binding and replay rejection |
| `SealManagerTests` | seal and unseal providers |
| `ECIESTests` | optional ECIES paths |

See the [functional test sources](functional/src/test/kotlin/org/exploit/test/functional/) for the complete set.

Run only the share-recovery scenario:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.RecoveryFailureInjectionTests'
```

The corrupted-share Schnorr and ECDSA scenarios make up to ten signing attempts because a 2-of-3 coordinator may select the other healthy peer. Assuming independent 50/50 peer selection, there is still about a 0.1% chance that the corrupted peer is never selected and either test fails; stable latency bias can make the actual probability higher.

## Test topology

- client index `3` targets a peer with coordinator endpoints disabled
- client index `2` targets a peer using the HSM seal provider
- test execution is single-fork and JUnit parallel execution is disabled

When diagnosing a cluster failure, use the prefixed `keeper-1`, `keeper-2`, and `keeper-3` logs to identify the peer and protocol stage that failed.

## Production transport coverage

`ProductionTransportSecurityTests` starts a separate three-node topology from the production UBI image and a jar that excludes development authentication and failure injection. The fixture generates an ephemeral CA, per-peer PKCS12 identities, trust stores, JWT signing keys, and an HTTPS JWKS endpoint for every run. No private test credentials are stored in the repository.

The topology exercises:

- public HTTP/2 over TLS 1.2 and 1.3, rejection of plaintext, wrong CAs, and wrong hostnames;
- JWT claim, signature, algorithm, subject, audience, permission, and development-token negatives;
- HTTPS JWKS rotation, old-key revocation, and last-known-good retention on every peer;
- internal mTLS client-certificate presence, CA, EKU, signed peer authentication, and distinct SPKI bindings;
- outbound peer TLS CA and hostname validation through the real keeper Jetty client;
- threshold DKG/sign/verify, peer restart, and recovery after TLS or pin failures;
- PEM hot rotation with continuous new connections and a deliberately mismatched cert/key interval;
- fail-closed startup for unsafe TLS, peer URL, JWKS/OIDC URL, and SPKI configurations.

The migration suites additionally verify V1 transaction logging, readiness/sealed behavior, audit continuity, persistence across container restart, and rejection of synthetic migration roots.

Run only this class with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.ProductionTransportSecurityTests'
```

## macOS

The current Gradle harness expects Colima. Use Colima 0.10+ with its gRPC port forwarder:

```bash
colima start --port-forwarder grpc
```

Gradle uses `COLIMA_SOCKET_ENV` when set, otherwise `~/.colima/default/docker.sock`, and routes published Testcontainers ports through `127.0.0.1`. Set `TESTCONTAINERS_HOST_OVERRIDE` explicitly only when using a different reachable host.
