![TKeeper logo](assets/keeper-banner.png)

<div align="center">

# TKeeper

**Distributed threshold KMS (t-of-n)** for environments where **no single machine** should have unilateral key authority.

[TKeeper Labs](https://tkeeper.org) • [Documentation](https://docs.exploit.org/tkeeper) • [OpenAPI](openapi.yaml)

</div>

## What it is

TKeeper *(Threshold Keeper)* is a distributed, threshold Key Management System (KMS) for environments where no single machine should have unilateral key authority.

It runs as a network of cooperating peers (“keepers”) and performs protected cryptographic operations using a **t-of-n** threshold model, requiring participation from at least **t distinct peers**.

> In many traditional key management setups, the private key still has a single point of custody: there is one place where the full key exists and can be used to sign or decrypt. If that storage or runtime environment is compromised, the attacker gets full key authority.
> 
> TKeeper avoids that class of risk. The private key is split into shares and is **never reconstructed** anywhere, including during key generation. As a result, compromising up to **t** machines is not sufficient to sign or decrypt.

## Capabilities

### Threshold signing
TKeeper performs quorum-based signing so no single host can authorize signatures. It supports signature verification and is built for crypto-first workloads, including modern schemes like Taproot signing.

### Threshold encryption and decryption
TKeeper supports threshold encryption and decryption using an ElGamal KEM over the secp256k1 curve, allowing data to be encrypted and decrypted via t-of-n quorum participation.

### Distributed key generation and key workflows
TKeeper supports Distributed Key Generation so the full private key is never generated or held by a single peer. Keys are managed through a versioned lifecycle using `logicalId` and `generation`, with create, rotate, refresh, and destroy operations.

### Permission-based access control
Every request is authenticated and authorized against explicit permission identifiers. Permissions are scoped by operation and can be limited per key using the key namespace, for example `tkeeper.key.{keyId}.sign`. A limited wildcard can be used to grant broader access when needed, for example `tkeeper.key.*.sign` or `tkeeper.key.*.*`.

### Compliance controls
TKeeper provides signed, tamper-evident audit records for security-relevant actions and supports verification endpoints. When audit logging is enabled, TKeeper can enforce sink availability: if no configured sink can accept an audit record, the operation is denied. TKeeper also supports asset inventory to make keys and metadata visible for governance, reviews, and operational oversight.

### Control Plane UI
TKeeper includes an administrative UI under `/ui` for day-to-day operations. Access is token-based, with optional OIDC login depending on configuration.

## Use cases

### Crypto custody and blockchain signing
For exchanges, custodial wallets, treasury, and settlement systems. Threshold signing prevents a single host from authorizing transactions. Crypto support is first-class, including Taproot signing.

### High-risk service signing
For internal signing services, CI/CD signing, license signing, and privileged automation. Quorum signing plus strict permissions prevents one machine or one operator from signing alone.

### Encryption with controlled decryption
For backups, exports, configuration bundles, and sensitive payloads. Data can be encrypted/decrypted using ElGamal KEM over the secp256k1 curve.

### Split control across environments or organizations
For deployments where keepers run in different zones, regions, or even different organizations. Threshold operations and authenticated keeper-to-keeper communication prevent unilateral sign/decrypt/rotate/destroy.

### Audit and compliance-driven operations
For environments that require traceability of security-relevant actions. Signed, tamper-evident audit records provide verifiable evidence.

### Versioned key lifecycle for long-lived systems
For platforms that need predictable rotations and safe key changes. `logicalId` + `generation` enables create/rotate/refresh/destroy workflows with guardrails around destructive operations.

## When TKeeper is not the right tool

TKeeper is a distributed threshold system. If you do not need threshold security, or you prioritize minimal operational complexity over custody guarantees, a single-node or centralized KMS may be a better fit.

Examples:

- Basic secret storage / envelope encryption without quorum operations
- Your threat model accepts a single key risk
- You cannot operate multiple peers reliably (availability, networking, monitoring)

 > If you need a general-purpose secrets manager rather than threshold custody, a traditional secrets manager may be a better fit (e.g., HashiCorp Vault).

## API reference

The OpenAPI specification describes the complete HTTP surface, request/response models, and error semantics. Use it as the canonical reference for integrations and automation.

See [OpenAPI Reference](openapi.yaml)

## Running Tests
TKeeper uses [Testcontainers](https://testcontainers.com) to run integration tests against a local Docker Compose cluster. See [integration tests](integration-tests) for details.

# License
TKeeper is licensed under [Apache License, Version 2.0](LICENSE.md).