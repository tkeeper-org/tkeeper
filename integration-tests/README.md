# Integration Tests

This project uses **Testcontainers** to run integration tests against a multi-node TKeeper cluster defined via Docker Compose.

The test harness starts the Compose stack, waits for the keeper API ports to become available, and collects container logs with per-service prefixes (`keeper-1`, `keeper-2`, `keeper-3`).

The Compose runtime is resolved automatically:

- Prefer `docker-compose` (Compose v1) when available
- Fallback to `docker compose` (Compose v2)

---

## Requirements

- Docker Engine
- Docker Compose:
  - `docker-compose` **or**
  - `docker compose`
- Java **25**

---

## Runing tests

### Build test docker image
Run from root project directory:
```bash
./gradlew dockerBuildIntegration -Pkeeper.docker.features=all
```
`keeper.docker.features=all` includes test-only integration helpers such as `feature-failure-injection`.
Regular runtime builds with `keeper.features=all` do not include those helpers.

Or select only the modules needed for a test run:
```bash
./gradlew dockerBuildIntegration -Pkeeper.docker.features=authority-evm,seal-aws,failure-injection
```

Run the full test suite:

```bash
./gradlew :integration-tests:test
```

Run a specific test class:

```bash
./gradlew :integration-tests:test --tests "org.exploit.tkeeper.test.{ClassName}"
```

See available test classes in [tests](src/test/kotlin/)

---

## Notes
Client with `idx = 3` has disabled coordinator (so it can't make generate/rotate/refresh, sign, encrypt/decrypt, destroy & consistency fix requests)

Client with `idx = 2` uses `hsm` as seal provider

## macOS notes (Colima)

On macOS, Docker **MUST** be provided by Colima. If your setup uses a non-default Docker socket, configure it via environment variables (`DOCKER_HOST`) before running tests. See [build.gradle](build.gradle) for details.
