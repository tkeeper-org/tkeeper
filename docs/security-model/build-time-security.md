# Build-time security

Keeper checks module selection, security components, and access to protected APIs
during packaging. Missing or conflicting components and modules outside the
selected profile fail the build. Docker image builds run the same checks.

## What packaging checks

| Check | Deployment effect |
| --- | --- |
| Feature and platform selection | The artifact contains the selected capabilities and their required security controls. |
| Access to key material | Public API handlers must use the services that enforce permissions and key lifecycle rules. |
| Approver registration | Registry changes must pass through all-member validation and replication. |
| Policy and approvals | Signing and protected lifecycle operations must retain their required authorization checks. |
| Edict functions | Functions are fixed by the selected features at packaging time. |
| Test isolation | Production artifacts exclude controls that can corrupt keys or protocol state. |

These checks catch missing controls and unauthorized access paths in the packaged code.
They do not prove that every permitted service is correct. Request-time checks still enforce
authentication and authorization. Reflection, code outside the packaged artifact, and native code
are outside their scope. See [Security assurance](security-assurance.md) for tested behavior and limits.

## Deployment artifacts

| Artifact | Use |
| --- | --- |
| Production JAR or versioned production image | Deployment with the selected features and platforms |
| `*-production-test.jar` or `exploit/tkeeper:production-it` | Transport and authentication tests only |
| `*-integration.jar` or `exploit/tkeeper:dev` | Integration and failure-injection tests only |

The integration artifact contains FailureInjection controls that can alter stored
keys and protocol state. Never deploy it in production. Production builds reject
these controls.

Keeper's features and functions are fixed at build time. Rebuild Keeper to add a
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
