# Hub contract fixtures

`openapi.json` contains the Hub API 1.0.0 contract used by the SDK tests. The tests use this bundled snapshot and do not require a Hub checkout.

`samples.json` contains full examples for all 193 component schemas, including optional fields and nested open JSON. The fixtures were validated against the snapshot using JSON Schema draft 2020-12. `models.json` maps Hub schema names to SDK models; shared native models are also exercised through endpoint transport tests.

Approver metadata examples include the optional `displayName` and a custom string entry for registration, metadata updates, invitations and registry responses.

When updating the contract, replace the snapshot, adjust the affected models and fixtures, and run `:sdk:test`. Keep fixtures conformant to the contract. Nullable required fields must remain observable, and optional null fields may be omitted.
