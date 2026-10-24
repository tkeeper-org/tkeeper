# Helidon service codegen fork

This build-only module maintains a fork of `io.helidon.service:helidon-service-codegen:4.5.6`
from the official [Helidon release](https://github.com/helidon-io/helidon/tree/4.5.6/service/codegen).
It replaces that artifact on annotation-processor classpaths. It is not a runtime dependency.
The remaining Helidon codegen modules stay on the upstream 4.5.6 artifacts.

Source artifact: [helidon-service-codegen-4.5.6-sources.jar](https://repo.maven.apache.org/maven2/io/helidon/service/helidon-service-codegen/4.5.6/helidon-service-codegen-4.5.6-sources.jar).
SHA-256: `85e587828314dca12c57b3a34bcd319379351b97385da76115f7dcd747f088f1`.
Java source files retain their upstream package names and copyright notices.
The classpath build omits upstream `module-info.java`; service registrations,
Apache 2.0 license and Oracle notices come from the same upstream binary artifact
and are preserved under `src/main/resources/META-INF`.

## Local changes

`DescribedType` has package-private visibility, as specified in its upstream
deprecation notice.

Dependency qualifier generation uses `Annotation.properties()`. Named dependency
qualifiers retain their values in generated descriptors.

`ServiceDescriptorCodegen.contract` unwraps a top-level covariant wildcard to its
`extends` bound when deriving an injection lookup contract. This fixes Kotlin
`List<T>` constructor parameters represented by kapt as Java `List<? extends T>`:
the descriptor retains the full declared parameter type, while looking up `T`
instead of generating the illegal anonymous superclass `GenericType<? extends T>`.
Parameterized contracts keep their nested wildcard arguments. Unbounded and
contravariant injection contracts fail with a clear compile-time diagnostic.

Generic service descriptor singleton fields and lifecycle callback parameters use
the raw service type, matching the descriptor's existing `T extends ServiceType`
bound. This prevents references to undeclared service type variables such as `P`
when generating descriptors for generic abstract providers. Inherited construction
and cleanup callbacks run once. Abstract providers are excluded from lookups, and
superclass constructor arguments do not become child injection dependencies.

The registry accepts `helidon.registry.moduleName` as a javac-compatible alias for
`helidon.codegen.module-name`, whose hyphen prevents declaring it as a supported
processor option. It also declares kapt's `kapt.kotlin.generated` hint; Java sources
continue to use the standard filer.

Run `./gradlew :build-tools:helidon-codegen:test` for generated-source compilation and
registry injection tests.
