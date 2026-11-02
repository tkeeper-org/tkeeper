# Translated upstream cases

This corpus contains 46 selected cases: 28 from CEL, 8 from Cedar and 10 from OPA.
It tests shared behavior and explicitly marked differences. It does not run the
upstream engines or establish compliance with any complete upstream test suite.

`cases.tsv` preserves the original case identifier, expression or policy summary,
upstream expectation, Edict translation and Edict expectation. `sources.tsv` links
each case to an immutable primary source and records the SHA-256 of the complete
source file inspected during extraction. CI reads the local translations only;
it does not download upstream material.

| Upstream | Revision inspected | License |
| --- | --- | --- |
| [CEL specification v0.25.2](https://github.com/cel-expr/cel-spec/tree/cb51b4176013ad19bd00df94be273c322916a620) | `cb51b4176013ad19bd00df94be273c322916a620` | Apache-2.0 |
| [Cedar v4.12.0](https://github.com/cedar-policy/cedar/tree/fdcbaed32bdb8c8d13e4eaf2b58db5555e9fb8c5) | `fdcbaed32bdb8c8d13e4eaf2b58db5555e9fb8c5` | Apache-2.0 |
| [OPA v1.20.2](https://github.com/open-policy-agent/opa/tree/b2c26708e9d55645d7f837db495031f7e4152594) | `b2c26708e9d55645d7f837db495031f7e4152594` | Apache-2.0 |

The original OPA files identify Copyright The OPA Authors; the original Cedar
files identify Copyright Cedar Contributors. CEL cases originate in the CEL
specification project. These selected test facts and translated expressions retain
their upstream attribution. [APACHE-2.0.txt](APACHE-2.0.txt) contains the upstream
Apache license, copied from Cedar at the pinned revision. This notice applies to
the adapted corpus and does not choose a license for Edict.

## Translation boundaries

- CEL arithmetic cases use signed values whose results agree with exact Number.
  The int64 overflow case is deliberately different: Edict returns the exact value
  within its configured numeric bounds. UInt, NaN, infinity, mixed numeric
  overloads and floating-point rounding are outside this subset.
- CEL `&&`, `||`, `!` and single-quoted text become Edict `and`, `or`, `not` and
  double-quoted text. The Boolean ternary `C ? false : true` becomes `not C`.
  CEL's error-masking OR case expects true after a reached error; Edict must abort
  with ARITHMETIC. The corresponding left short-circuit case remains successful.
- Cedar permit/forbid composition maps to allow/deny. Its empty-set predicates
  are translated only to empty-list predicates on empty or singleton collections;
  no set equality, duplicate elimination or unordered iteration is implied.
  The entity comparison example uses the one exact identity from its request as
  text; it does not test an entity hierarchy.
- Cedar's `skip_on_error_tests` accepts a permit despite missing-attribute errors.
  Edict rejects that translated closed-record access during compilation. The
  incompatible `isEmpty` receiver also becomes a static type error. Cedar has no
  shared general-purpose null value in these cases; the corpus does not invent
  one. Actual null equality comes from the CEL source case.
- OPA's fixed scalar default examples become functions whose final return is the
  fallback value. Their original default and defined values remain unchanged.
  This translation does not import Rego's search or complete-document model.
- OPA's undefined complete document has no query result. Its permission projection
  in Edict has no matching allow and returns DENY. Undefined remains distinct from
  null, false and evaluation failure in the recorded upstream expectation.
- OPA's complete-document conflict case enumerates several outputs. The Edict
  contrast unrolls two conflicting outputs into duplicate immutable declarations,
  which fail statically; it does not claim equivalent dynamic conflict handling.
- The selected OPA divide/modulo-by-zero fixtures enable `strict_error: true` and
  correspond to Edict's reached arithmetic errors. OPA's fractional remainder
  error also agrees with Edict's integer-only remainder contract. Rego's general
  undefined-on-builtin-error behavior is not treated as compatible with abort.

The translations and divergent expectations were written for Edict. The source
identifiers and upstream expectations come from the pinned test files. Each TSV
row labels its relation as `compatible`, `syntax-adaptation` or
`deliberate-divergence` so the distinction remains visible in review.
