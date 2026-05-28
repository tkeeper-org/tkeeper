# Authority Fixtures

These documents are test-only Verdict authority bundles. Tests must publish them through
`AuthorityFixtures.publish(...)`, which uploads each document to the local OCI registry and returns
`oci://...@sha256:...` references only.

Fixture ids:

- `test:custom/payments-small`
- `test:custom/payments-country`
- `test:custom/treasury-large`
- `test:custom/payroll-eur`
- `test:custom/admin-ops`
- `test:evm/mainnet-native-small`
- `test:evm/mainnet-usdc-transfer`
- `test:evm/sepolia-demo-token`
- `test:bitcoin/btc-small-output`
- `test:tron/trx-small-transfer`
- `test:x509/service-leaf`
