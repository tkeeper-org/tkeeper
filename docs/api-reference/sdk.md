# Java SDK

The Java SDK provides typed modules for the public TKeeper API:

- [SDK README](../../sdk/README.md)
- Maven coordinate: `org.exploit:tkeeper-sdk:3.0.0`
- Java toolchain: 17 or newer

Find the API operation for a client method in the [SDK module table](../../sdk/README.md#modules). [OpenAPI](../../openapi.yaml) defines their request and response format.

## Integration rules

- Use `JwtTokenAuth` in production and scope its permissions to the required identities and operations.
- Close `TKeeperClient` to release its HTTP resources.
- Pass `KeySetAuthorities` explicitly when creating governed identities. Convenience constructors without authorities select `arbitrary` raw signing.
- Build signing requests with `AuthorityCommand` and use `VerificationCommand.from(command)` for verification. Verification checks the signature against `type` and `artifact`. It does not load an authority or reassess policy.
- Use `dryRun().emulate(...)` to preview an authority-policy decision. See [Dry Run Policy Evaluation](../signing-and-authorities/dry-run.md).
- Use `approvers()` to register credentials, then pin returned refs in key or authority policies. Registration does not grant approval authority.
- Use `approvals().prepare(...)` for WebAuthn approval challenges. The [SDK migration notes](../../sdk/README.md) cover the `Proof` interface and its implementations.
- Use `central().getConfig()` for runtime modules and quorum settings, and `controlPlane().listIdentities(...)` for the caller's permitted signing identities.
- Catch `TKeeperException` and branch on `ErrorType`, not diagnostic detail text.
- Do not retry authorization or policy denials as availability failures.

## Compose results

`signature().compose(Sign.of(keyId, command), ResultType.class)` runs the same authority, policy, approval, and signing checks as `signature().sign(...)`. It then assembles a protocol result when the command type has a composer. See [Composer](../signing-and-authorities/composer.md) for the endpoint and fallback behavior.

| Command type                      | Result type               |
|-----------------------------------|---------------------------|
| `ap2.mandate`, `mcintent.mandate` | `PaymentCredential`       |
| `evm.transaction`                 | `SignedEvmTransaction`    |
| `tron.transaction`                | `SignedTronTransaction`   |
| `xrp.transaction`                 | `SignedXrpTransaction`    |
| `solana.transaction`              | `SignedSolanaTransaction` |

For other types, compose returns `ThresholdSignature`, the same raw signature result as sign. To inspect an unknown result, use `signature().compose(request)` for JSON. The signed Solana result can be partial. Check `complete` before broadcast. See [agentic payments](../ai/agentic-payments/README.md) and [digital assets](../digital-assets/README.md) for examples.
