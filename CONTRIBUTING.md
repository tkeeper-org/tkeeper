# Contributing to TKeeper

Keep changes focused and explain their effect on behavior, compatibility, and security.

## Where to post what

- **Security issues:** do **NOT** open a public issue or discussion. See [SECURITY](SECURITY.md) and email `security@tkeeper.org`.
- **Questions / support:** use **GitHub Discussions** (Q&A).
- **Bug reports:** use **GitHub Issues** (only after you can describe a reproducible problem).
- **Design proposals / larger changes:** start in **Discussions** first (Ideas), then open an issue/PR.

## Reporting a bug (Issues)

Before opening an issue:

- Search existing issues/discussions.
- Test on the latest release (or `main` if you can).

Include:

- Expected vs actual behavior
- TKeeper version / commit SHA
- Minimal reproduction steps
- Logs/stack traces
- Environment (OS, JDK)

Include a minimal failing test when possible.

## Feature requests

Start in Discussions with:

- The real problem you're solving
- Proposed API/behavior
- Compatibility notes (breaking vs non-breaking)
- Any relevant standards/papers/RFCs

If the direction is agreed, convert it to an issue.

## Testing expectations

- If your change affects behavior, **add or update an integration test**. See [integration tests](integration-tests).
- If you're not sure whether something is behavioral, assume it is and add the test.

## Code style

- Prefer small PRs with one clear purpose.
- Add tests for behavior changes when practical.
- Don’t mix large refactors with bug fixes. A fix should address one reproducible problem.
- Keep public API changes explicit.

## Protected APIs

### Calls that fail the build

The build rejects calls from classes that are not declared owners of a protected
API:

| Blocked call | Supported call |
| --- | --- |
| `SignatureController` → `SessionManagerInstance.coordinate(...)` | `SignatureController` → `SigningSessionManager.coordinate(request)` → `SessionManagerInstance.coordinate(...)` |
| `StorageController` → `KeyImportService.importFromPeer(...)` | `StorageController` → `KeyStorageService.store(request)` |
| `ApproversController` → `ApproversService.proposeRegister(...)` | `ApproversController` → `ApproversClusterService.register(request)` |

The checks cover declared APIs and packaged bytecode. Reflection, code loaded at runtime, native code, and the correctness of branches inside an approved
service are outside this check's scope.

### Declaring resource owners

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

## Documentation

- Keep the existing section layout and write for the task the reader is completing.
- Explain behavior, required inputs, results, and relevant limits. Include a detail only if it helps the reader act, verify a result, or make a decision.
- Name dependencies or internal classes only when the reader needs them to build, configure, troubleshoot, or assess a specific security assumption.
- Use direct sentences and concrete examples. Remove promotional claims, slogans, rhetorical contrasts, generic introductions, and repeated summaries.
- Use lists for steps or parallel items and tables for comparisons. Use prose for connected explanations. Avoid mechanical bold labels and unnecessary emphasis.
- Document stable behavior. Avoid vague status words and predictions. Include versions when compatibility depends on them.
- Check claims against code and the API contract. Preserve security assumptions and residual risks, and verify examples, relative links, and heading anchors after editing.

## Commit messages

Use short, clear commit messages that describe the change. Prefixes such as `feat:`, `fix:`, or `chore:` are not required.

Good examples:

- `Fix Java SDK signature validation`
- `Add integration test for expired keys`
- `Update dependency versions`
- `Document key rotation behavior`

Keep each commit focused on one logical change.

## Pull requests

A PR should include:

- What changed (short summary)
- Why it changed (rationale)
- Tests added/updated (or why not)
- Notes on compatibility and security impact (if applicable)

## License

By contributing, you agree that your contributions are licensed under the project [Apache 2.0](LICENSE.md) license.
