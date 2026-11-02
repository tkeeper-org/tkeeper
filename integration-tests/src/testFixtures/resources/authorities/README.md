# Authority fixtures

These `.edict` documents are published to the local OCI registry by `AuthorityFixtures.publish`. Tests use the returned digest-pinned references.

The folders cover custom JSON, Bitcoin, EVM, TRON, XRP, Solana, XLM/Soroban, X.509, AP2 and Mastercard VI. Custom schemas are declared with `input` and `struct`; protocol interfaces use native `contract` or `program` declarations.

`vectors/xlm-stellar-sdk-17.4.0.json` is copied from the Edict XLM vector corpus generated with `@stellar/stellar-sdk@17.4.0`. It contains deterministic test seeds and native envelopes. Tests preserve the published bytes for decoder checks and change explicit transaction fields when building Keeper scenarios.
