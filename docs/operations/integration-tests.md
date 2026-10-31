# Integration tests

Run the complete release verification with:

```bash
./gradlew releaseGate
```

This runs the root and module unit tests and compiles the complete Edict documentation examples. It then verifies isolation between production and test artifacts. After building both test images, it executes the functional integration suite. Performance benchmarks remain separate.

Build both test images from the repository root:

```bash
./gradlew buildTestContainers
```

This creates `exploit/tkeeper:dev` and `exploit/tkeeper:production-it`. Run the complete functional suite with:

```bash
./gradlew :integration-tests:functional:test
```

Functional tests reuse the current images and do not rebuild them. Re-run `buildTestContainers` after changing app code, dependencies, or Dockerfiles. The test task always executes when requested instead of treating the external container state as `UP-TO-DATE`.

Run one class with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.ProductionTransportSecurityTests'
```

Run only the audit-inspired malicious protocol-input probes with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.FailureInjectionTests.frostRejectsInvalidSigningPackage' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.validFrostSigningTranscriptPasses' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.frostSigningTranscriptRejectsMaliciousInput' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.gg20RejectsInvalidSigningPackage' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.validGg20MtATranscriptsPassOnSupportedCurves' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.mldsaRejectsInvalidSigningPackage' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.validMLDSASigningTranscriptPasses' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.mldsaSigningTranscriptRejectsMaliciousInput' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.gg20MtARejectsMaliciousInput' \
  --tests 'org.exploit.test.functional.FailureInjectionTests.maliciousCoordinatorCannotInjectInvalidEciesParticipantSet'
```

Run the in-flight FROST, GG20, and ML-DSA crash-recovery checkpoints with:

```bash
./gradlew buildTestContainers
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.FailureInjectionTests.inFlightProtocolStateDoesNotSurviveKeeperRestart*'
```

The development topology uses compose volumes for keeper-1 through keeper-3 so
RocksDB data and the keeper-2 SoftHSM token persist across container restarts. Signing
sessions remain process-local and must not survive it.

Run the keeper protocol-order, replay, and concurrent-transition cases with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.FailureInjectionTests.keeperProtocolStateRejectsReorderedReplayAndConcurrentTransitions*'
```

This sends invalid transitions through the internal peer transport for ECC DKG, PQC DKG, FROST,
GG20, and threshold ML-DSA signing. Replay and eight-way race cases require exactly one accepted
transition. A normal distributed signature follows every case.

Run the 3-of-5 share-recovery scenario with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.RecoveryFailureInjectionTests'
```

The scenario creates ECC and ML-DSA histories in a cluster using production TLS. It damages two
peers in different ways before restarting all five keepers in recovery mode. The test selects three helpers to repair both damaged peers. After restarting in normal mode, the test verifies stored state and signing.

Run the registry, enrollment and reference-policy cases with:

```bash
./gradlew :integration-tests:functional:test \
  --tests 'org.exploit.test.functional.ApproversTests' \
  --tests 'org.exploit.test.functional.WebAuthnApproversTests' \
  --tests 'org.exploit.test.functional.ApproverReferenceTests' \
  --tests 'org.exploit.test.functional.ApproverProtocolFailureTests' \
  --tests 'org.exploit.test.functional.ApproverPromotionTests' \
  --tests 'org.exploit.test.functional.ApprovalExpirationTests'
```

These cases cover permission and method substitution, invitation reuse, peer disagreement,
missing descriptors, actual deadline expiry, competing requests, and durable state after restarts.
The protocol suite holds follower PREPARE and receipt collection at explicit barriers. It checks
that signing and reads continue while a registry write waits, and that fully prepared enrollment
can commit after the writer stops and the challenge and JWT expire. The test also verifies that expiry leaves partial preparations locked and does not permit their commit.

`FourEyeWebAuthnTests` covers assertion verification and replay across signing, decryption, and
lifecycle operations. `MandateTests` covers primary-authenticated preparation followed by mandate
execution. The WebAuthn fixtures simulate authenticators. Browser UI and physical authenticator
behavior need separate checks.

Run the deterministic property and fuzz-seed regressions for security-sensitive
binary formats with:

```bash
./gradlew :platform-ecc:test \
  --tests 'org.exploit.keeper.platform.ecc.property.SecuritySerializationProperties' \
  --tests 'org.exploit.keeper.platform.ecc.fuzz.SecurityBinaryParserFuzzTest'
```

Run the coverage-guided parser fuzzer for 30 seconds with:

```bash
./gradlew :platform-ecc:fuzzSecurityParsers
```

Run the deterministic protocol-state properties and fuzz seeds with:

```bash
./gradlew :platform-ecc:test \
  --tests 'org.exploit.keeper.platform.ecc.property.ProtocolStateMachineProperties' \
  --tests 'org.exploit.keeper.platform.ecc.fuzz.SecurityProtocolStateFuzzTest' \
  --tests 'org.exploit.keeper.platform.ecc.fuzz.KeeperProtocolStateFuzzTest'
./gradlew :platform-pqc:test \
  --tests 'org.exploit.keeper.platform.pqc.property.MLDSAStateMachineProperties' \
  --tests 'org.exploit.keeper.platform.pqc.fuzz.MLDSAStateMachineFuzzTest' \
  --tests 'org.exploit.keeper.platform.pqc.fuzz.KeeperMLDSAProtocolStateFuzzTest'
./gradlew :test \
  --tests 'org.exploit.keeper.tests.temporary.InMemoryTemporaryMapConcurrencyTest'
```

Run all coverage-guided security campaigns with:

```bash
./gradlew securityFuzz
```

Override the time budget when running a longer local or scheduled campaign:

```bash
./gradlew :platform-ecc:fuzzSecurityParsers -Pkeeper.fuzz.duration=5m
./gradlew :platform-ecc:fuzzProtocolStateMachines -Pkeeper.fuzz.duration=5m
./gradlew :platform-ecc:fuzzKeeperProtocolStateMachines -Pkeeper.fuzz.duration=5m
./gradlew :platform-pqc:fuzzMLDSAStateMachine -Pkeeper.fuzz.duration=5m
./gradlew :platform-pqc:fuzzKeeperMLDSAProtocols -Pkeeper.fuzz.duration=5m
./gradlew :features:recovery:ecc:fuzzRecoveryProtocol -Pkeeper.fuzz.duration=5m
./gradlew :features:recovery:pqc:fuzzRecoveryPayloads -Pkeeper.fuzz.duration=5m
```

The generated `.cifuzz-corpus/` is local build state and is ignored. Reduce
any finding and retain it as an explicit seed or property regression before
merging the fix.

Do not pass `keeper.features` or `keeper.platforms` to `buildTestContainers`. The development integration image includes:

- every default production feature
- the explicit recovery feature and both recovery platform modules
- development authentication
- dry-run policy evaluation
- one-time operation mandates
- every platform
- the test-only failure-injection module

The image used to test production transport uses the production UBI Dockerfile and excludes development
authentication, dry run, recovery, and failure injection. Regular `shadowJar` and `dockerBuild`
exclude failure injection. Dry run and recovery are included only when selected.

See [`../../integration-tests/README.md`](../../integration-tests/README.md) for local requirements and Testcontainers setup.

See [Security Assurance](../security-model/security-assurance.md) for the security vectors exercised by the functional suite and the limits of that evidence.

## Edict and XLM

`./gradlew :edict:check` checks the language and native decoder modules. `./gradlew verifyEdictDocumentation` compiles the complete policy examples with Keeper's host contracts.

`XlmAuthorityTests` exercises OCI publication, native XLM and Soroban policy checks, signing-account and network binding, independent signature verification, composition and the control-plane schema. Fee-bump scenarios check plain and muxed outer fee sources, the outer signing hash, preservation of inner signatures, and rejection of an inner source key, excessive fees, and extra operations. `AuthorityPolicyTests.typedMapPreservesDecimalPrecisionAcrossEveryPeer` checks exact decimal JSON through a distributed signature and rejects an amount just greater than its limit.
