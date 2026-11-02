# Edict

Edict compiles policy documents into immutable execution plans. Core provides schemas, exact arithmetic, functions, decisions, and approval requirements. Protocol modules bind EVM, Solana, and Soroban declarations and decode native inputs.

`fn-commons` provides byte, text, and time functions. Protocol modules supply their own function providers through the `extension-api` contract. See [Bytes, time, and module functions](../docs/edict/bytes-time-and-functions.md) for the language API and [Java hosts and function providers](#java-hosts-and-function-providers) for registration.

Start with [Edict language guide](../docs/edict/README.md). The [Keeper authority guides](../docs/signing-and-authorities/authorities.md) describe the supported command types and their trust boundaries.

Core can also be used without Keeper:

```java
var policy = new Edict().compile("""
    authority "limits" {
        input request { limits: Map<Text, Number> }
        policy "limits" {
            allow if (request.limits.values().sum() <= 100)
        }
    }
    """);
var result = policy.evaluate(Map.of("request", Value.object(Map.of(
        "limits", Value.object(Map.of("USD", Value.number(50)))))));
```

Use `org.exploit.edict.Edict` and `org.exploit.edict.model.value.Value`. Keeper's `intent` and `version` properties are requirements of its authority contract, rather than core language syntax.

`Map<Text, T>` is immutable and sorted by text key. Records close their declared fields. Map values must match `T`. Protocol wire structs retain their module's native layout rules.

Run `./gradlew :edict:check` for module tests, saved fuzz regressions, and coverage checks. `:edict:fuzzSource` runs source mutation. Its duration and execution count are set with `fuzzDuration` and `fuzzExecutions`. `./gradlew verifyEdictDocumentation` compiles the complete policy examples in the Keeper documentation.

## Java hosts and function providers

`FunctionModule` belongs to `extension-api`. A module supplies named `FunctionDefinition` values and optional `MethodDefinition` values. Named functions use `namespace.name`. A method's first parameter is its receiver. The compiler checks parameter and result types and binds the function into the execution plan. Returned values undergo validation too.

The default `Edict` constructors discover providers with Java `ServiceLoader`. A provider JAR registers its provider class in `META-INF/services/org.exploit.edict.extension.FunctionModule`. The four-argument constructor accepts an explicit list of providers. An empty list disables module functions. Duplicate module IDs, function names, and receiver methods are rejected. `CompiledPolicy.functionModules()` reports installed module versions.

Keeper passes an explicit provider list from its closed service registry. The build selects the function factories with the enabled features and verifies their implementations in the packaged JAR. Additional service metadata cannot add functions at runtime. Rebuild Keeper to change the installed providers.

Java hosts can pass `new EvaluationContext(instant)` to `evaluate` or `evaluateAll` for a fixed evaluation time. The default overload captures the current time once per evaluation.

Function implementations are trusted host code. They must reserve work and allocation budgets before processing input or creating results. A budget does not interrupt arbitrary Java code. Declare a function as constant only when its result depends on its arguments and fixed module configuration. Functions that need evaluation context must set `constant` to `false`.

Native Java `byte[]` and `Instant` inputs become `Bytes` and `Time`. Byte values use the configured `stringCharacters` limit as their maximum byte count.
