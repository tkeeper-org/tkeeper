# Edict

Edict compiles policy documents into immutable execution plans. Core provides schemas, exact arithmetic, functions, decisions and approval requirements. Protocol modules bind EVM, Solana and Soroban declarations and decode native inputs.

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

`Map<Text, T>` is immutable and sorted by text key. Records close their declared fields; maps validate dynamic values against `T`. Protocol wire structs retain their module's native layout rules.

Run `./gradlew :edict:check` for module tests, saved fuzz regressions and coverage checks. `:edict:fuzzSource` runs source mutation; its duration and execution count are set with `fuzzDuration` and `fuzzExecutions`. `./gradlew verifyEdictDocumentation` compiles the complete policy examples in the Keeper documentation.
