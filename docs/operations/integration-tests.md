# Integration tests

The functional suite checks signing, approvals, key lifecycle operations, authentication, and
recovery on multi-node Keeper clusters. Run it before deploying a source build or validating
an upgrade. Use an isolated test environment: failure-injection tests deliberately alter stored
keys and protocol state.

## Run the release checks

From the repository root, with Java 25 and Docker available:

```bash
./gradlew releaseGate
```

The release checks cover module tests, complete Edict examples, and packaged artifacts.
The command also builds the test images and runs the functional suite. Performance benchmarks are separate.

## Run a focused check

Build the test images, then select the relevant suite:

```bash
./gradlew buildTestContainers
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.ApproversTests'
```

Rebuild the images after changing app code, dependencies, or Dockerfiles. Test runs
reuse the existing images. Both `exploit/tkeeper:dev` and `exploit/tkeeper:production-it` are
for testing. Deploy the production artifact described in [Build and features](../deployment/build-and-features.md).

See [test setup](../../integration-tests/README.md) for Docker and macOS requirements.
[Focused test scenarios](../../integration-tests/SCENARIOS.md) lists commands for protocol,
registry, replay, restart, and recovery checks.

## Interpret the result

A passing suite confirms the scenarios exercised by that build. It does not validate the
deployment's cloud credentials, HSM access, TLS configuration, backup procedure, or downstream
signature verifier. Test those in the target environment before enabling key operations.
WebAuthn tests simulate authenticators. Check the browser flow and physical authenticators separately.

[Security assurance](../security-model/security-assurance.md) describes coverage and limits.
Use the [production checklist](../deployment/production-checklist.md) for deployment readiness.
