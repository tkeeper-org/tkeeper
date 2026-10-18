# Hub contract fixtures

`openapi.json` is a lossless JSON serialization of the user-supplied `tkeeper-hub/openapi.yaml` (Hub API 1.0.0). `source.sha256` pins the original YAML bytes. The SDK tests run independently of the Hub checkout and check drift when the sibling source is present.

`samples.json` contains full examples for all 191 component schemas, including optional fields and nested open JSON. The fixtures were validated against the snapshot using JSON Schema draft 2020-12. `models.json` maps Hub schema names to SDK models; shared native models are also exercised through endpoint transport tests.

When updating the contract, replace the snapshot, update the original YAML hash, adjust the affected models and fixtures, and run `:sdk:test`. Keep fixtures conformant to the supplied contract. Nullable required fields must remain observable, and optional null fields may be omitted.
