# Build-time security

Keeper checks module selection, security components, and access to protected APIs
during packaging. Missing or conflicting components and modules outside the
selected profile fail the build. Docker image builds run the same checks.

## Assets and call paths

HTTP authentication runs before the controller. Protected operations pass through
services that check permissions, inputs, and operation state before using storage
or protocol implementations.

| Resource | Build-time check | Request-time protection |
| --- | --- | --- |
| Authentication, guards, and mandate admission | Required services and their providers must match the selected modules. | Credentials, permissions, operation binding, expiry, and replay checks. |
| Seal material, key shares, and signed storage | External controllers cannot reference raw storage, seal, or protocol capabilities. | Lifecycle permissions, key-generation admission and record integrity checks. |
| Integrity keys and audit signing | Key access, rotation, migration and signing APIs have explicit owners. | Rotation permission, signature verification, and audit sink enforcement. |
| Key creation, import, destruction, and quorum changes | Controllers must use the corresponding operation services. | Resource permissions, authenticated peer identity and import/session binding. |
| Approver registry and proofs | Registry writes pass through the cluster service. Local write shortcuts are forbidden. | Registration and metadata permissions, replicated admission and WebAuthn invitation/session checks. |
| Authorities and recovery | Required guards are present. External controllers cannot call raw evaluators or recovery handlers. | Policy validation, recovery permission and peer/contribution binding. |
| Public keys, inventory and control-plane data | Controllers use the protected read APIs. | Resource permissions and identity filtering. |
| Request context and cleanup | Required middleware and cleanup declarations must be present. | Context propagation and sensitive-buffer cleanup. |

Peer protocol rounds require authenticated peer identity and session state.
Bootstrap uses restricted lifecycle entry points.

## Calls that fail the build

The build rejects calls from classes that are not declared owners of a protected
API:

| Blocked call | Supported call |
| --- | --- |
| `SignatureController` → `SessionManagerInstance.coordinate(...)` | `SignatureController` → `SigningSessionManager.coordinate(request)` → `SessionManagerInstance.coordinate(...)` |
| `StorageController` → `KeyImportService.importFromPeer(...)` | `StorageController` → `KeyStorageService.store(request)` |
| `ApproversController` → `ApproversService.proposeRegister(...)` | `ApproversController` → `ApproversClusterService.register(request)` |

The checks cover declared APIs and packaged bytecode. Reflection, code loaded at runtime, native code, and the correctness of branches inside an approved
service are outside this check's scope.

## Declaring resource owners

Declare access at the protected API with `@RestrictedResource`:

```kotlin
@RestrictedResource(owners = [SignatureController::class, KeeperComposer::class])
fun coordinate(request: Sign): CalculatedSignature
```

The compiler retains declarations in class files. Packaging checks them before
generating the app service registry and again in the final JAR.

Owner privileges apply to exact classes. Subclasses and nested classes need their own owner declarations, and name prefixes do not grant access. Restrictions cover overloads, implementations, inherited
receivers, method references and Kotlin default/access bridges. Annotate one
overload. Implementations cannot widen the contract's owners. Self-calls require
an explicit owner.

Use `ownerNames` with exact JVM binary names for owners in optional modules or
generated code. Shared names live in `ResourceOwners`. `integrationOwners` grants
access only in the integration profile. Invalid declarations fail the build even
when no packaged caller uses the API.

An empty owner list denies all calls. A type-level declaration must specify
`methods`. This also reserves removed API names, such as the local approver write
shortcuts. A method-level declaration cannot override this restriction.

Mark raw capabilities with `@InternalResource`. External controllers cannot
use these types or their subtypes in fields or generic signatures, or reference them elsewhere.

Rules for dependency-owned APIs, including Helidon descriptor lifecycle methods,
are defined in `buildSrc`. It also checks the raw storage namespace and app
registry bootstrap.

## Deployment artifacts

| Artifact | Use |
| --- | --- |
| Production JAR or versioned production image | Deployment with the selected features and platforms |
| `*-production-test.jar` or `exploit/tkeeper:production-it` | Transport and authentication tests only |
| `*-integration.jar` or `exploit/tkeeper:dev` | Integration and failure-injection tests only |

The integration artifact contains FailureInjection controls that can alter stored
keys and protocol state. Never deploy it in production. Production builds reject
these controls.

Keeper's service list and features are fixed at build time. Rebuild Keeper to add a
feature or platform.
`auth-dev`, `dry-run`, `mandate` and `recovery` require explicit selection and are
excluded from `all`. See the [build instructions](../deployment/build-and-features.md)
for selectors, artifact names and supported OS/CPU targets.

## Building from source

Keeper requires Java 25. Build the default production artifact with:

```bash
./gradlew build -Pkeeper.features=all -Pkeeper.platforms=all
```

Packaging checks run automatically with `build`, `shadowJar` and `dockerBuild`.
Correct any reported failure before deploying the artifact. Do not exclude a failing
check to produce a release.

Run the full test suite before publishing a source build:

```bash
./gradlew releaseGate
```

This requires Docker and includes module tests, artifact isolation, and functional
cluster tests. For a cross build, also run the native-library loading check on the
deployment OS/CPU as described in the build instructions.

## Deployment checks

Deploy the artifact that passed the checks. Changes made after packaging are outside the build checks.
The build host and the sources of downloaded artifacts require separate protection.

Configure [authentication and peer access](authentication-authorization.md) and
[audit logging](audit-logging.md) for the deployment. Verify host libraries, KMS/HSM access, and TLS settings in the target environment
through deployment checks separate from packaging.
