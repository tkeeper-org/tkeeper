# Java SDK

The Java SDK provides typed modules for the public TKeeper API:

- [SDK README](../../sdk/README.md)
- Maven coordinate: `org.exploit:tkeeper-sdk:2.5.0`
- Java toolchain: 17 or newer

The SDK follows the same module boundaries as the API: system, DKG, signing, storage/import, quorum promotion, ECIES, dry run, compliance, expiration, audit, integrity, consistency, destroy, and control-plane reads.

The wire contract remains [`../../openapi.yaml`](../../openapi.yaml). Treat generated or handwritten SDK helpers as convenience code, not a competing source of truth.

## Integration rules

- Use `JwtTokenAuth` in production and scope its permissions to the required identities and operations.
- Close `TKeeperClient` to release its HTTP resources.
- Pass `KeySetAuthorities` explicitly when creating governed identities; convenience constructors without authorities select `arbitrary` raw signing.
- Build signing requests with `AuthorityCommand`. Verify converts it to a `VerificationCommand`, which retains only the material `type` and `artifact`. Verification may use any supported material type, including typed or arbitrary material, without requiring that type or payload to belong to the key's current authority manifest.
- Use `dryRun().emulate(...)` to preview an authority-policy decision; see [Dry Run Policy Evaluation](../signing-and-authorities/dry-run.md).
- Catch `TKeeperException` and branch on `ErrorType`, not diagnostic detail text.
- Do not retry authorization or policy denials as availability failures.

## Compose results

`signature().compose(Sign.of(keyId, command), ResultType.class)` runs the same authority, policy, approval, and signing checks as `signature().sign(...)`. It then assembles a protocol result when the command type has a composer. See [Composer](../signing-and-authorities/composer.md) for the endpoint and fallback behavior.

| Command type | Result type |
| --- | --- |
| `ap2.mandate`, `mcintent.mandate` | `PaymentCredential` |
| `evm.transaction` | `SignedEvmTransaction` |
| `tron.transaction` | `SignedTronTransaction` |
| `xrp.transaction` | `SignedXrpTransaction` |
| `solana.transaction` | `SignedSolanaTransaction` |

For other types, compose returns `ThresholdSignature`, the same raw signature result as sign. To inspect an unknown result, use `signature().compose(request)` for JSON. The signed Solana result can be partial; check `complete` before broadcast. See [agentic payments](../signing-and-authorities/agentic-payments.md) and [digital assets](../signing-and-authorities/digital-assets/README.md) for examples.
