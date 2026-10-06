# Security Assurance

The functional suites exercise signing, decryption, authorization, transport,
storage, lifecycle operations, and recovery in multi-node TKeeper deployments.
Adversarial scenarios inject invalid protocol messages, replay requests, corrupt
stored state, and interrupt operations.

The development topology uses a `2-of-3` quorum with storage, SoftHSM, restarts,
and injected protocol failures. Production tests use TLS, mTLS, peer signatures,
and per-peer SPKI pins in a three-node transport cluster and a `3-of-5` recovery
cluster. The transport tests also exercise JWT and JWKS behavior.

The Release Gate runs module tests, functional scenarios, artifact-isolation checks,
and both container builds on pull requests to `main` and pushes to `main`. A passing
revision confirms the tested cases for that artifact. The evidence below identifies
the scenarios and their limits.

## Security posture

The suites check that:

- threshold signing and decryption use distributed shares;
- peers reject invalid signer sets, proofs, contributions, and reused session state;
- authority policy and approvals bind to the requested operation in the tested paths;
- public TLS/JWT and peer mTLS/signatures reject tested identity and transport attacks;
- storage mutations fail validation, and failed migrations leave the node sealed;
- default production test artifacts exclude development authentication, dry run,
  failure injection, and recovery.

## Evidence quality

| Evidence layer | How it is exercised | Security signal |
| --- | --- | --- |
| Distributed execution | Functional tests run multi-node Keeper clusters with key generation, shares, network calls, storage, and cryptographic implementations. | Exercises system boundaries and protocol composition across deployed components. |
| Production transport topology | The production image runs with generated PKI, TLS, mTLS, certificate pins, JWT, JWKS rotation, and connection-rejection cases. | Exercises deployed authentication and transport failure modes. |
| Protocol failure injection | A test-only module introduces one security-relevant mutation at a time into FROST, GG20, ML-DSA, ECIES, and keeper protocol transitions. | Demonstrates rejection at the peer that consumes untrusted protocol data. |
| Failure contracts | Negative cases assert rejection reason and, where the protocol supports it, attribution of the malicious peer. | Detects regressions that crash or reject for the wrong reason. |
| Recovery checks | Every FROST, ML-DSA, and keeper-transition mutation is followed by a distributed signature. A separate 3-of-5 topology rebuilds ECC and ML-DSA histories on two damaged peers. | Confirms continued key use after rejected protocol input and checks full key-scoped state reconstruction. |
| Generative parser testing | Serialization properties generate inputs and shrink failures; a seeded Jazzer target explores malformed inputs in security-sensitive binary decoders. | Checks round-trip, canonical encoding, record binding, key-kind preservation, bounded parsing, and controlled rejection beyond hand-written examples. |
| Stateful protocol modeling | Lifecycle and protocol-state properties generate participant topologies, action sequences, and concurrent schedules. Jazzer targets cover the protocol state containers used by ECC DKG, PQC DKG, FROST, GG20, threshold ML-DSA signing, and ECC/PQC recovery payload handling. | Compares state containers against legal-transition, uniqueness, operation-isolation, order-independence, single-winner consumption, destroy-state, transcript-binding, and recovery-payload models. |
| Concurrency and crash recovery | Eight simultaneous deliveries race for one signing session or one keeper protocol transition. Container-restart cases stop a keeper after FROST nonce generation, GG20 ephemeral initialization, or ML-DSA round 1. | Checks one-winner transitions, terminal session state, durable key state, safe session recreation, and post-failure signing. |
| Release isolation | The release gate checks module tests, functional behavior, container builds, and separation of integration-only and explicit recovery code from the default production artifact. | Checks that production artifacts exclude the test harness and recovery endpoints unless recovery is selected. |

## Assurance by domain

| Security domain | Demonstrated assurance | Detailed evidence |
| --- | --- | --- |
| Threshold protocol integrity | Malformed signer sets, invalid transition order, sequential or concurrent replay, invalid proofs, transcript mutations, bad partial contributions, and consumed-state reuse fail closed across ECC/PQC DKG, FROST, GG20, and threshold ML-DSA. Generated and concurrent action schedules additionally check the protocol state containers against explicit transition models. | [Threshold protocols](#threshold-protocols) |
| Byzantine tolerance and recovery | Invalid attributable FROST, GG20, and ECIES contributions identify the responsible peer; an honest quorum continues where the protocol permits retry. Mismatched ML-DSA shares cannot produce a signature. Operator-selected helper consensus reconstructs ECC and ML-DSA histories on damaged peers without restoring destroyed secret material. | [Byzantine peers](#byzantine-peers-and-recovery) |
| Authentication and transport | Forged or malformed JWTs, missing permissions, TLS downgrade, unknown CAs, hostname mismatch, invalid client certificates, peer impersonation, and unsafe production configuration are rejected. | [Identity and transport](#identity-and-transport) |
| Intent, policy, and approvals | Authority confusion, typed-intent mutation, policy deletion, incomplete approvals, approval substitution, replay, and nonce races cannot authorize a tested protected operation. | [Authorization and policy](#authorization-and-policy) |
| Key state and lifecycle | Signed-record tampering, relocation, pointer rollback, unsafe migration, conflicting lifecycle mutations, and invalid promotion state fail closed or preserve the documented identity invariant. Security-sensitive binary records additionally have generative canonicality, binding, and malformed-input coverage. | [State and lifecycle](#state-lifecycle-and-audit) |
| Signature and decryption correctness | Threshold and mono outputs verify across supported ECC and ML-DSA paths; modified signatures, payloads, ML-DSA components, ECIES ciphertexts, and tweaks are rejected. | [Output integrity](#output-integrity) |
| Operational security | Credential rotation retains the last known good identity on invalid updates. Durable keys and HSM state survive a tested keeper restart while process-local signing state is purged; audit records remain verifiable across restart and migration, and integration-only modules remain outside production artifacts. | [Operational controls](#operational-controls) |

## Adversarial protocol coverage

Each adversarial vector is reported as a separate JUnit invocation. The
FROST, GG20, and ML-DSA suite contains 53 negative cases and three valid
controls:

| Protocol | Malicious signing packages | Transcript or protocol-input mutations | Valid controls | Reported cases |
| --- | ---: | ---: | ---: | ---: |
| FROST | 6 | 11 | 1 | 18 |
| GG20 | 6 | 12 | 1 | 19 |
| Threshold ML-DSA | 6 | 12 | 1 | 19 |
| **Total** | **18** | **35** | **3** | **56** |

FROST commitments and signature shares are produced by a remote Keeper.
GG20 controls generate valid Paillier and zero-knowledge proof material before
each mutated input is sent to the production respondent. ML-DSA probes exercise
the stored-key commit/reveal state machine. The exact vectors and expected
failure contracts are listed in the [exact protocol vector catalog](#exact-protocol-vector-catalog).

ECIES adds participant-set validation, DLEQ verification of partial decryptions,
and negative ciphertext and tweak coverage outside the 56 signing cases above.

Keeper protocol-order coverage adds seven failure-injection invocations:

| State machine | Reordered transition | Replay | Eight-way race | Reported cases |
| --- | ---: | ---: | ---: | ---: |
| ECC DKG | 1 | 0 | 0 | 1 |
| PQC DKG | 0 | 1 | 1 | 2 |
| FROST signing | 1 | 0 | 0 | 1 |
| GG20 signing | 1 | 0 | 0 | 1 |
| Threshold ML-DSA signing | 0 | 1 | 1 | 2 |
| **Total** | **3** | **2** | **2** | **7** |

These cases cross the internal peer transport. The race cases require one accepted transition and
seven rejected duplicates. Each case ends with a normal distributed signature.

## Research lineage and interpretation

| Source | Failure cases converted into executable regressions |
| --- | --- |
| [RFC 9591] and the [NCC Group Zcash FROST assessment] | Distinct and valid signer identities, exact commitment sets, participant binding, proof validation, partial-signature verification, and one-shot nonce state. |
| [BitForge GG18/GG20 finding] | Invalid Paillier modulus, generator, ciphertext, range proof, biprime proof, and no-small-factor proof inputs. |
| [CGGMP21 modulus-proof advisory], [CGGMP24 Pi-enc hardening], and [CGGMP24 aff-g hardening] | Multiplicative-group membership variants across Paillier ciphertexts, randomizers, range commitments, and Ring-Pedersen proof elements; non-coprime biprime witnesses. |
| [Efficient Threshold ML-DSA] | Commit/reveal binding, exact round participants, malformed transcript rejection, and one-shot round state. |
| [NIST ACVP ML-DSA specification] | Independent mutation of the final signature commitment, `z`, hint, and message across ML-DSA-44, ML-DSA-65, and ML-DSA-87. |
| TKeeper variant analysis and [Anvil Paillier proof regressions] | Truncated and non-canonical binary inputs, degenerate zero-ciphertext proofs, concurrent state resurrection, session replay, consumed-state reuse, and in-flight keeper crash schedules. |

## Reproducing the assurance

Run the release gate:

```bash
./gradlew releaseGate
```

This builds the integration and production transport images, runs module and
functional tests, and verifies artifact isolation. A shorter command for the
protocol-input package is documented under
[Integration Tests](../operations/integration-tests.md).

The property and coverage-guided parser layer can be reproduced separately:

```bash
./gradlew :platform-ecc:test \
  --tests 'org.exploit.keeper.platform.ecc.property.SecuritySerializationProperties' \
  --tests 'org.exploit.keeper.platform.ecc.fuzz.SecurityBinaryParserFuzzTest'
./gradlew :platform-ecc:fuzzSecurityParsers
```

Run the generated and coverage-guided protocol-state layer with:

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
./gradlew securityFuzz
```

`securityFuzz` runs seven coverage-guided campaigns: binary decoding, the existing ECC and ML-DSA
state containers, keeper-level ECC and ML-DSA protocol transitions, ECC recovery sessions, and PQC
recovery payloads.

## Deployment and operational boundaries

The following conditions require deployment or operational controls outside
the Keeper process:

- compromise of at least the configured threshold, or compromise of the host,
  HSM, cloud unseal authority, build pipeline, or deployment control plane;
- broad denial of service, physical side channels, fault injection, entropy
  failure, and platform-specific constant-time behavior;
- coherent full-database rollback without an external monotonic control;
- unsafe authority policy, use of raw `arbitrary` signing where semantic
  governance is required, or a downstream verifier that ignores identity,
  intent, expiry, or replay requirements.

The [Threat Model](threat-model.md) specifies the corresponding trust
assumptions and mitigations. Exact test traceability continues below in
[Executable evidence](#executable-evidence).

## Executable evidence

This catalog maps each demonstrated security property to executable evidence
and records the exact adversarial protocol vectors. Threat identifiers refer
to the [Threat Model](threat-model.md). Evidence is revision-specific: the test
names identify the executable contract, while the release gate determines
whether that contract passes for a given artifact.

### Threshold protocols

| Control boundary | Verified behavior | Evidence |
| --- | --- | --- |
| Coordinator-supplied signing package (T-7) | FROST, GG20, and threshold ML-DSA peers reject omission of the local participant, duplicate, undersized, or out-of-range participant sets, and sequential replay of an active session id. Under an eight-way concurrent replay, exactly one creator wins and all seven duplicates receive `SESSION_ALREADY_EXISTS`. Each protocol/vector pair is independently reported. | [FailureInjectionTests]: `frostRejectsInvalidSigningPackage`, `gg20RejectsInvalidSigningPackage`, `mldsaRejectsInvalidSigningPackage` |
| FROST commitment and signature transcript (T-7) | A remote Keeper produces the commitment and signature share. Changed proof material, malformed encoding, identity mismatch, missing or duplicate contributions, cross-context replay, changed nonce commitment, changed signature share, and consumed nonce reuse fail closed. Attributable failures identify the remote peer. | [FailureInjectionTests]: `validFrostSigningTranscriptPasses`, `frostSigningTranscriptRejectsMaliciousInput` |
| GG20 MtA and Paillier input (T-7) | Valid transcripts pass on both supported GG20 curves. Small, even, or oversized moduli, invalid generator, zero, non-coprime, or out-of-range ciphertexts, non-coprime biprime witnesses, and mutated or truncated range, biprime, and no-small-factor proof material produce an identifiable abort attributed to the initiator. | [FailureInjectionTests]: `validGg20MtATranscriptsPassOnSupportedCurves`, `gg20MtARejectsMaliciousInput` |
| Threshold ML-DSA commit/reveal transcript (T-7) | A valid stored-key transcript passes. Changed or truncated commitments and reveals, duplicate, missing, or out-of-range round senders, commitment-opening mismatch, and reuse of consumed round state fail closed as independently reported cases. | [FailureInjectionTests]: `validMLDSASigningTranscriptPasses`, `mldsaSigningTranscriptRejectsMaliciousInput` |
| Generated protocol-state transitions (T-7) | Valid threshold participant sets are order-independent; omission, duplication, wrong size, and out-of-range mutation fail with the expected contract. FROST nonce pairs and shares remain operation-scoped and one-shot, GG20 MtA values remain per-peer unique and order-independent, and ML-DSA batches and round stores match explicit transition and destruction models across generated action sequences. Concurrent nonce/share/MtA/round-state races have exactly one winner. Session-map close is terminal, revokes each remaining value once, and prevents state from being restored after closure. | [ProtocolStateMachineProperties]; [SecurityProtocolStateFuzzTest]; [MLDSAStateMachineProperties]; [MLDSAStateMachineFuzzTest]; [InMemoryTemporaryMapConcurrencyTest] |
| Keeper protocol transition order (T-7) | ECC DKG completion before computation, FROST signing before commitment collection, and GG20 signing before setup are rejected. PQC DKG and ML-DSA signing reject sequential round-1 replay; eight simultaneous round-1 deliveries produce one winner. Generated actions cover these production transition guards and failure rollback. | [FailureInjectionTests]: `keeperProtocolStateRejectsReorderedReplayAndConcurrentTransitions`; [KeeperProtocolStateFuzzTest]; [KeeperMLDSAProtocolStateFuzzTest] |
| In-flight keeper crash (T-7) | A keeper is restarted after FROST nonce generation, GG20 ephemeral initialization, or ML-DSA round 1. Persistent RocksDB and HSM key state survive, but the process-local session cannot resume and returns `SESSION_NOT_FOUND`. The same session id can then be created and cleared safely, followed by a valid distributed signature. | [FailureInjectionTests]: `inFlightProtocolStateDoesNotSurviveKeeperRestart` |
| Supported protocol paths | Threshold and mono signing and verification execute across GG20 ECDSA, FROST Schnorr/BIP-340/Taproot, threshold Ed25519, and ML-DSA-44/65/87, including supported tweak paths. ECIES executes with AES-GCM and ChaCha20-Poly1305 on secp256k1 and P-256. | [SignatureTests]: scheme-specific sign/verify tests; [ECIESTests]: `encryptDecryptSuccessful`, `encryptDecryptSuccessfulWithTweak`, `ensureDleqProofPassesAfterRefresh` |

The FROST participant, proof, commitment-set, signature-share, duplicate, and
nonce-consumption invariants execute in the ciphersuite-independent shared
signing state machine. Ciphersuite-specific valid signing and verification
paths are covered in [SignatureTests].

### Byzantine peers and recovery

| Failure mode | Verified behavior | Evidence |
| --- | --- | --- |
| Corrupted FROST share (T-7) | A peer with internally coherent but incorrect local share and commitments initializes from its own stored public state; its invalid contribution is then rejected and attributed while an honest threshold still produces a verifiable Schnorr signature. | [FailureInjectionTests]: `corruptedKeyMaterialOnOnePeerDoesNotForgeOrStopThreshold` |
| Corrupted GG20 share (T-7) | A peer with internally coherent but incorrect local share and commitments initializes from its own stored public state; its invalid contribution is then rejected and attributed while an honest threshold still produces a verifiable ECDSA signature. | [FailureInjectionTests]: `corruptedEcdsaKeyMaterialOnOnePeerDoesNotForgeOrStopThreshold` |
| ML-DSA public side-state mismatch (T-7) | A peer whose stored aggregate public state has been changed cannot silently contribute; the coordinator retries with a healthy peer. | [FailureInjectionTests]: `tamperedMLDSAPublicKeySideStateRetriesWithHealthyPeer` |
| ML-DSA quorum share mismatch (T-7) | A quorum assembled from shares belonging to different keys cannot produce a signature. | [FailureInjectionTests]: `mismatchedMLDSAPartySharesCannotProduceSignature` |
| Corrupted ECIES partial decrypt (T-8) | The DLEQ proof rejects the contribution, attributes the peer, and an honest threshold still decrypts. | [FailureInjectionTests]: `corruptedEciesKeyMaterialOnOnePeerIsRejectedByDleqProof` |
| Malicious ECIES participant set (T-8) | Omitted local peer, duplicate identifier, undersized set, and configured-range violation are rejected before threshold decryption. | [FailureInjectionTests]: `maliciousCoordinatorCannotInjectInvalidEciesParticipantSet` |
| Damaged peer reconstruction (T-9, T-13) | In a production-TLS 3-of-5 cluster, two peers with complementary missing, rolled-back, and corrupted ECC/ML-DSA state are rebuilt from three explicit healthy helpers. Helper disagreement fails before writes. Recovery restores metadata, policy, authorities, public side-state, history, owner indexes, and active signing while destroyed generations remain without secret material. A forced mid-transaction failure rolls back, and a prefix-adjacent key remains unchanged. | [RecoveryFailureInjectionTests]: `recoversComplementaryDamageAndHistoryAcrossTwoPeers` |

### Identity and transport

| Attack or failure | Verified behavior | Evidence |
| --- | --- | --- |
| Forged or malformed production JWT (T-1) | Missing token, malformed JWT, missing or unknown `kid`, bad signature, RS256/HS256 confusion, invalid issuer, audience or lifetime, and missing or blank subject are rejected with `401`. The development token is not accepted by the production topology. | [ProductionTransportSecurityTests]: `protectedEndpointRejectsMissingJwt`, `developmentTokenHeaderCannotAuthenticateProductionTopology`, `rejectsInvalidJwtVariants` |
| Authenticated principal without permission (T-2) | A valid identity without the required permission is rejected with `403` on a representative protected control-plane endpoint. | [ProductionTransportSecurityTests]: `authenticatedPrincipalWithoutPermissionIsDenied` |
| Public transport downgrade or impersonation (T-1) | The public API accepts TLS 1.2 and 1.3, refuses plaintext on the TLS port, and clients reject unknown CAs and hostname mismatch. | [ProductionTransportSecurityTests]: `publicApiNegotiatesEverySupportedProductionTlsProtocol`, `plaintextCannotBeUsedOnPublicTlsPort`, `publicCertificateFromUnknownCaIsRejected`, `publicCertificateHostnameMismatchIsRejected` |
| Peer transport impersonation (T-7, T-8) | The internal listener requires an appropriate CA-trusted client certificate and client-auth EKU. A CA-trusted outsider still fails signed peer authentication. Outbound peers reject unknown CAs, hostname mismatch, and swapped per-peer SPKI pins. | [ProductionTransportSecurityTests]: `internalListenerRequiresClientCertificate`, `internalListenerRejectsClientCertificateFromUnknownCa`, `internalListenerRejectsCertificateWithoutClientAuthEku`, `caTrustedClientCertificateStillRequiresSignedPeerAuthentication`, `outboundPeerTlsRejectsServersFromUnknownCa`, `outboundPeerTlsRejectsServerHostnameMismatch`, `swappedPeerPinsBreakProtocolAndRestoringPinsRecoversIt` |
| Unsafe production security configuration | Startup fails for disabled public or peer TLS, insecure peer/JWKS/OIDC URLs, credential-bearing or fragmented peer URLs, disabled internal client authentication, and duplicate or malformed peer identities and pins. | [ProductionTransportSecurityTests]: `rejectsUnsafeProductionStartupConfiguration` |
| Credential disclosure | Private test credentials are checked for absence from container logs. | [ProductionTransportSecurityTests]: `privateCredentialsNeverAppearInContainerLogs` |

### Authorization and policy

| Attack or failure | Verified behavior | Evidence |
| --- | --- | --- |
| Authority downgrade or type confusion (T-3, partial T-4) | Raw `arbitrary` authority cannot be mixed with OCI authorities or declared by an OCI authority document. Empty, duplicate, malformed, missing-reference, reference/id-mismatched, unsupported, command-unattached, and artifact-type-mismatched authorities fail closed. | [AuthorityPolicyTests]: `rejectsAuthorityThatIsNotAllowedForKey`, `rejectsArtifactTypeThatDoesNotMatchAuthorityType`, `rejectsGenerateWithArbitraryMixedWithOciAuthority`, `rejectsOciAuthorityWithArbitraryType`, `rejectsDuplicateAuthorityIdsOnGenerate`, `rejectsGenerateWithEmptyAuthorities`, `rejectsGenerateWithInvalidAuthorityId`, `rejectsOciAuthorityWithoutReference`, `rejectsOciReferenceWhoseAuthorityIdDoesNotMatch`, `rejectsUnsupportedAuthorityTypeBeforeCreatingKey`, `verifyRejectsMalformedEvmMaterialWithoutResolvingAuthority` |
| Disabled arbitrary authority (T-3) | A keeper with `arbitrary` disabled rejects both creation of a raw-signing key and signing with an existing key whose stored authority is `arbitrary`. | [ArbitraryAuthorityConfigTests]: `rejectsArbitraryKeyCreationWhenDisabled`, `rejectsArbitrarySigningForExistingKeyWhenDisabled` |
| Typed intent or effect-policy bypass (T-5) | Allowed commands sign while policy violations are denied for custom payments, EVM native/ERC-20 transfer, approval, `transferFrom`, vault operations, Bitcoin spend, and X.509 issuance. Unknown fields, wrong types, wrong principals, and over-limit amounts are exercised. | [AuthorityPolicyTests]: `deniesTypedCommandRejectedByAuthorityPolicy`, `rejectsTypedCommandWithUnknownField`, `rejectsTypedCommandWithWrongFieldType`, `deniesEvmErc20ApprovalWhenAmountExceedsPolicy`, `deniesEvmErc20TransferFromWhenOwnerDoesNotMatchPolicy`, `deniesEvmVaultWithdrawWhenRecipientDoesNotMatchPolicy`, `deniesBitcoinSpendRejectedByAuthorityPolicy`, `deniesX509TbsCertificateRejectedByAuthorityPolicy` |
| Dry-run policy bypass (T-1, T-3, T-5) | The optional endpoint reports allow, deny, and four-eye-control decisions with approval requirements; it requires authentication, validates key identifiers and existence, and rejects authorities not assigned to the key. | [DryRunTests]: `returnsAllowForAcceptedCommand`, `returnsDenyAsEvaluationResult`, `returnsAllowWithRequirementsForFourEyeControl`, `requiresAuthentication`, `rejectsInvalidKeyId`, `rejectsMissingKey`, `rejectsAuthorityNotAssignedToKey` |
| Four-eye bypass or incomplete approval group (T-6) | Sign, decrypt, refresh, rotate, and destroy fail without required proofs. Replaced approver sets invalidate old proofs; every matching authority group is required; key and authority requirements are cumulative. | [FourEyeControlTests]: `ensureDecryptRequiresProofs`, `ensureSignRequiresProofs`, `ensureRefreshRequiresProofs`, `ensureOldKeySetNoLongerWorks`, `ensureRotateRequiresProofs`, `authorityPolicyRequiresEveryMatchingApprovalGroup`, `keyAndAuthorityPoliciesShareOneApprovalNonce`, `lenientFourEyeControlAppliesToDestroy` |
| Approval substitution, replay, or race (T-6) | Changing an approved command invalidates its proof. A consumed approval cannot replay; concurrent submissions yield only one success; consumption survives coordinator restart. | [FourEyeControlTests]: `authorityPolicyBindsProofsAndRejectsReplay`, `approvalNonceIsConsumedAtomically`, `approvalNonceRemainsConsumedAfterCoordinatorRestart` |
| Single-peer policy tampering (T-3, T-5, T-6) | Mutating the coordinator's authority or deleting its four-eye or expiry policy does not reach threshold. A healthy quorum still accepts a valid command when one non-coordinator peer has missing or swapped authority metadata. | [FailureInjectionTests]: `arbitraryAuthorityInjectedOnOneCoordinatorPeerDoesNotReachThreshold`, `authoritySwappedOnCoordinatorCannotAuthorizeDifferentCommand`, `fourEyePolicyDeletedOnCoordinatorStillRequiresPeerApprovals`, `expiredApplyPolicyClearedOnCoordinatorStillBlocksAtPeers`, `validCommandStillSignsWhenOnePeerRemovedAuthorities`, `validCommandStillSignsWhenOnePeerSwappedAuthorities` |
| Coordinator role boundary (T-13) | DKG, ECIES, signing, destroy, and consistency mutation requests sent to a non-coordinator are rejected with `NOT_COORDINATOR`. | [CoordinatorDisabledTest]: `ensureDkgDisabled`, `ensureCipherDisabled`, `ensureSignaturesDisabled`, `ensureDestroyDisabled`, `ensureConsistencyFixDisabled` |

### State, lifecycle, and audit

| Attack or failure | Verified behavior | Evidence |
| --- | --- | --- |
| Stored-record tampering, relocation, or pointer rollback (T-9) | Changed metadata and signed generations are exposed as tampered. Moving a location-bound active record, restoring an old generation pointer, or mixing legacy and signed storage fails closed with `TAMPERED_KEEPER`. | [FailureInjectionTests]: `tamperedMetadataIsVisibleInInventory`, `tamperedSignedKeyGenerationIsFlaggedInInventory`, `relocatedSignedActiveRecordFailsClosed`, `rolledBackGenerationPointerFailsClosedWithoutFallback`, `refreshRejectsMixedLegacyAndSignedStorage` |
| Malicious or mixed migration state (T-9, T-13) | Migration refuses non-empty targets and synthetic roots. Failed migration is not committed, remains sealed across restart, and does not expose protected operations. Valid migration runs once and preserves key and audit state. | [LegacyStorageMixedStateTests]: `migrationRefusesToOverwriteNonEmptyTargetStore`; [LegacyStorageUntrustedRootTests]: `migrationRejectsRandomAuthenticatedDataWithSyntheticPointer`; [LegacyStorageMigrationTests]: `v211V1KeyStorageMigratesOnceBeforeRefreshAndRotate` |
| Destructive or conflicting lifecycle mutation (partial T-12, T-13) | Duplicate create/import, invalid imported encoding, algorithm-changing refresh, and current-generation destruction fail. Old-generation destruction propagates across peers. | [KeyImportTests]: `invalidBase64ImportFails`, `duplicateImportFails`; [KeyLifecycleTests]: `duplicateCreateFails`, `refreshMLDSAWithDifferentAlgorithmFailsWithoutChangingGeneration`, `destroyActualGenerationFails`, `ensureDestroyedSecp256k1KeyGenerationOnAllKeepers` |
| Concurrent DKG and signing | Admitted FROST sessions complete with their original generation across refresh and rotation. ML-DSA sessions retain their selected generation and reject round replay. Duplicate DKG and consistency repair cannot remove another active attempt or its pending state, including after a partially successful remote initialization. | [KeyLifecycleConcurrencyTests](../../integration-tests/functional/src/test/kotlin/org/exploit/test/functional/KeyLifecycleConcurrencyTests.kt) |
| Generation change during authorization | Generation and metadata are captured together. A change before admission rejects the request; admitted signing stays on the captured generation. DKG rejects a target derived from a generation promoted after authorization. | [SigningGenerationRaceTest](../../platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/lifecycle/SigningGenerationRaceTest.kt); [KeyGenerationAuthorizationRaceTest](../../platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/lifecycle/KeyGenerationAuthorizationRaceTest.kt) |
| Mono-to-threshold promotion | Promotion preserves the active identity, destroys mono history, and requires restart before threshold use. | [QuorumPromotionTests]: `promoteMonoKeeperAndRequireRestart`, `promotedInventoryKeepsMetadataAndDestroysMonoHistory`, `promotedKeysSignAndVerifyAsThresholdKeys` |
| Inventory query scope | Historical inventory without a logical id and cursors outside that logical scope are rejected. Owner filters do not expose records owned by another or unknown owner. | [InventoryIndexTest]: `inventoryHistoricalRequiresLogicalId`, `inventoryRejectsCursorOutsideLogicalScope`, `historicalInventoryForMismatchedOwnerReturnsEmptyPage`, `monoInventoryIndexesOwnerAndValidatesCursors` |
| Audit integrity and persistence (partial T-11) | Audit records have distinct verifiable signatures and remain present and verifiable across storage migration and restart. | [LegacyStorageMigrationTests]: `v211V1KeyStorageMigratesOnceBeforeRefreshAndRotate` |
| Binary record parsing (T-9) | Signed payloads, record-bound secrets, typed keys, DKG commitments, and imported keys preserve their security metadata across canonical round trips. Generated malformed inputs terminate at the documented controlled error boundary. Parsing checks input bounds, canonical UTF-8 encoding, and trailing bytes, including truncated commitment inputs. | [SecuritySerializationProperties]; [SecurityBinaryParserFuzzTest] |

### Output integrity

| Mutation | Verified behavior | Evidence |
| --- | --- | --- |
| Signature or intent substitution (T-5, T-17 boundary) | Modified signature, wrong payload, signature from another key, policy-rejected typed payload, invalid encoding, and incompatible scheme, curve, payload, or tweak combinations are rejected. | [SignatureTests]: `verifyTamperedSignatureReturnsFalse`, `verifyWrongPayloadReturnsFalse`, `verifyInvalidSignatureBase64Fails`; [AuthorityPolicyTests]: `verifyReturnsFalseEvenWhenTypedPayloadIsRejectedByPolicy`, `verifyReturnsFalseWhenUsingSignatureFromAnotherKey` |
| ML-DSA signature component mutation | Commitment, `z`, hint, and message mutations are rejected for threshold and mono ML-DSA-44, ML-DSA-65, and ML-DSA-87 outputs. | [SignatureTests]: `testThresholdMLDSA44Signature`, `testThresholdMLDSA65Signature`, `testThresholdMLDSA87Signature`, `monoMLDSA44SignsAndVerifies`, `monoMLDSA65SignsAndVerifies`, `monoMLDSA87SignsAndVerifies` |
| ECIES ciphertext or tweak mutation | Changed ciphertext and wrong tweak fail in threshold and mono modes. | [ECIESTests]: `decryptTamperedCiphertextFails`, `decryptWithWrongTweakFails`, `monoDecryptTamperedCiphertextFails`, `monoDecryptWithWrongTweakFails` |

### Operational controls

| Operational event | Verified behavior | Evidence |
| --- | --- | --- |
| Invalid TLS identity rotation | A mismatched PEM key/certificate update retains the last known good identity. | [ProductionTransportSecurityTests]: `publicPemRotationRetainsLastKnownGoodIdentityWhileFilesMismatch` |
| JWKS rotation or refresh failure | Rotation accepts the new key and removes the retired key; failed refresh retains the last known good set. | [ProductionTransportSecurityTests]: `jwksRotationAcceptsNewSigningKeyWithoutRestart`, `failedJwksRefreshKeepsLastKnownGoodKeys` |
| Optional-module isolation | Development authentication, dry run, failure injection, and recovery modules are present in the integration artifact and absent from the production test artifact. | `./gradlew artifactIsolationTest` |
| Release evidence | Module tests, artifact isolation, container builds, functional suites, and production transport tests execute as one release gate. | `./gradlew releaseGate` |

### Exact protocol vector catalog

#### Shared signing-package boundary

Each vector runs independently against FROST, GG20, and threshold ML-DSA.

| Vector | Expected contract |
| --- | --- |
| `OMIT_LOCAL_PARTICIPANT` | `NOT_PARTICIPANT` |
| `DUPLICATE_PARTICIPANT` | `INVALID_REQUEST_BODY` |
| `UNDERSIZED_PARTICIPANT_SET` | `INVALID_REQUEST_BODY` |
| `OUT_OF_RANGE_PARTICIPANT` | `INVALID_REQUEST_BODY` |
| `REPLAY_SESSION_ID` | `SESSION_ALREADY_EXISTS` |
| `CONCURRENT_REPLAY_SESSION_ID` | Exactly one of eight simultaneous creators succeeds; seven receive `SESSION_ALREADY_EXISTS`. |

#### FROST transcript

| Vectors | Security property | Expected contract |
| --- | --- | --- |
| `TAMPER_PROOF_POINT`, `TAMPER_PROOF_SCALAR` | Proof of possession binds the contribution to the participant public share and additional context. | Identifiable abort attributed to the remote peer. |
| `TRUNCATE_COMMITMENT_POINT` | Malformed point encoding does not enter protocol state. | `IllegalArgumentException` |
| `MISMATCH_COMMITMENT_INDEX`, `DUPLICATE_COMMITMENT` | Commitment identity is exact and unique. | Identifiable abort attributed to the remote peer. |
| `OMIT_PARTICIPANT_COMMITMENT` | The commitment set must equal the signer set. | `IllegalStateException` |
| `REPLAY_COMMITMENT_CONTEXT` | A commitment cannot be replayed under different additional context. | Identifiable abort attributed to the remote peer. |
| `TAMPER_NONCE_COMMITMENT`, `TAMPER_SIGNATURE_SHARE` | The partial signature must verify against its nonce commitment and public share. | Identifiable abort attributed to the remote peer. |
| `DUPLICATE_SIGNATURE_SHARE`, `REUSE_NONCE_STATE` | Signature shares are unique and local signing nonces are one-shot. | `IllegalStateException` |

#### GG20 MtA and proofs

Every negative below produces `IdentifiableAbortException` attributed to the
initiating peer.

| Boundary | Vectors |
| --- | --- |
| Paillier modulus | `SMALL_COMPOSITE_MODULUS`, `EVEN_MODULUS`, `OVERSIZED_MODULUS` |
| Paillier generator | `INVALID_GENERATOR` |
| Ciphertext domain | `ZERO_CIPHERTEXT`, `NON_COPRIME_CIPHERTEXT`, `OUT_OF_RANGE_CIPHERTEXT` |
| Range proof | `TAMPER_RANGE_PROOF` |
| Biprime proof | `TAMPER_BIPRIME_PROOF`, `NON_COPRIME_BIPRIME_W`, `TRUNCATE_BIPRIME_TRANSCRIPT` |
| No-small-factor proof | `TAMPER_NO_SMALL_FACTOR_PROOF` |

#### Threshold ML-DSA transcript

| Vectors | Security property | Expected contract |
| --- | --- | --- |
| `TAMPER_OWN_COMMITMENT`, `TAMPER_COMMITMENT_OPENING` | Commitment and reveal must match. | `SecurityException` |
| `TRUNCATE_COMMITMENT`, `DUPLICATE_ROUND1_PARTY`, `OMIT_ROUND1_PARTY`, `OUT_OF_RANGE_ROUND1_PARTY` | Round-1 encoding and participant set are exact. | `IllegalArgumentException` |
| `TRUNCATE_REVEAL`, `DUPLICATE_ROUND2_PARTY`, `OMIT_ROUND2_PARTY`, `OUT_OF_RANGE_ROUND2_PARTY` | Round-2 encoding and participant set are exact. | `IllegalArgumentException` |
| `REUSE_ROUND1_STATE` | Round-1 state is consumed after advancing. | `IllegalStateException` |
| `REUSE_ROUND2_STATE` | Round-2 state is consumed after producing a response. | Fails closed; the current dependency surfaces `NullPointerException`. |

After every negative FROST and ML-DSA transcript probe, the functional suite
produces and verifies a normal distributed signature with the same stored key.

[RFC 9591]: https://www.rfc-editor.org/rfc/rfc9591.html
[NCC Group Zcash FROST assessment]: https://www.nccgroup.com/media/m1yjijzn/_ncc_group_zcashfoundation_e008263_report_2023-10-20_v11-1.pdf
[BitForge GG18/GG20 finding]: https://www.fireblocks.com/blog/gg18-and-gg20-paillier-key-vulnerability-technical-report?cve=title
[CGGMP21 modulus-proof advisory]: https://github.com/LFDT-Lockness/cggmp21/security/advisories/GHSA-m95p-425x-x889
[CGGMP24 Pi-enc hardening]: https://github.com/LFDT-Lockness/cggmp21/commit/a1b7dc6c1e669789e2bfdff8e1bbfbf12cbe1057
[CGGMP24 aff-g hardening]: https://github.com/LFDT-Lockness/cggmp21/commit/fd81bb8cb70f0b04961c1771cfa31e571847694e
[Anvil Paillier proof regressions]: https://github.com/exploit-org/anvil/tree/main/paillier/src/test/java/org/exploit/crypto/paillier/test
[Efficient Threshold ML-DSA]: https://inria.hal.science/hal-05442192v1/document
[NIST ACVP ML-DSA specification]: https://pages.nist.gov/ACVP/draft-celi-acvp-ml-dsa.html
[ArbitraryAuthorityConfigTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/ArbitraryAuthorityConfigTests.kt
[AuthorityPolicyTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/AuthorityPolicyTests.kt
[CoordinatorDisabledTest]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/CoordinatorDisabledTest.kt
[DryRunTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/DryRunTests.kt
[ECIESTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/ECIESTests.kt
[FailureInjectionTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/FailureInjectionTests.kt
[RecoveryFailureInjectionTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/RecoveryFailureInjectionTests.kt
[FourEyeControlTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/FourEyeControlTests.kt
[InventoryIndexTest]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/InventoryIndexTest.kt
[InMemoryTemporaryMapConcurrencyTest]: https://github.com/tkeeper-org/tkeeper/blob/main/src/test/kotlin/org/exploit/keeper/tests/temporary/InMemoryTemporaryMapConcurrencyTest.kt
[KeyImportTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/KeyImportTests.kt
[KeyLifecycleTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/KeyLifecycleTests.kt
[LegacyStorageMigrationTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/LegacyStorageMigrationTests.kt
[LegacyStorageMixedStateTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/LegacyStorageMixedStateTests.kt
[LegacyStorageUntrustedRootTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/LegacyStorageUntrustedRootTests.kt
[MLDSAStateMachineFuzzTest]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-pqc/src/test/kotlin/org/exploit/keeper/platform/pqc/fuzz/MLDSAStateMachineFuzzTest.kt
[MLDSAStateMachineProperties]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-pqc/src/test/kotlin/org/exploit/keeper/platform/pqc/property/MLDSAStateMachineProperties.kt
[KeeperMLDSAProtocolStateFuzzTest]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-pqc/src/test/kotlin/org/exploit/keeper/platform/pqc/fuzz/KeeperMLDSAProtocolStateFuzzTest.kt
[ProductionTransportSecurityTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/ProductionTransportSecurityTests.kt
[QuorumPromotionTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/QuorumPromotionTests.kt
[ProtocolStateMachineProperties]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/property/ProtocolStateMachineProperties.kt
[KeeperProtocolStateFuzzTest]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/fuzz/KeeperProtocolStateFuzzTest.kt
[SecurityBinaryParserFuzzTest]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/fuzz/SecurityBinaryParserFuzzTest.kt
[SecurityProtocolStateFuzzTest]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/fuzz/SecurityProtocolStateFuzzTest.kt
[SecuritySerializationProperties]: https://github.com/tkeeper-org/tkeeper/blob/main/platform-ecc/src/test/kotlin/org/exploit/keeper/platform/ecc/property/SecuritySerializationProperties.kt
[SignatureTests]: https://github.com/tkeeper-org/tkeeper/blob/main/integration-tests/functional/src/test/kotlin/org/exploit/test/functional/SignatureTests.kt
