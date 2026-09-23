# TKeeper Docs

TKeeper gives machines, agents, services, and workflows a cryptographic identity whose use is constrained by explicit authorities and policy.

## Read first

- [Overview](overview/README.md)
- [Use Cases](use-cases/README.md)
- [Getting Started](getting-started/README.md)
- [Deployment](deployment/README.md)
- [Security Model](security-model/README.md)
- [Cryptographic Identities](key-management/README.md)
- [Signing and Authorities](signing-and-authorities/README.md)
- [Crypto Platforms](crypto-platforms/README.md)
- [API Reference](api-reference/README.md)
- [Operations](operations/README.md)

## Use cases

- [For AI](use-cases/for-ai.md)
- [For Digital Assets](use-cases/for-digital-assets.md)
- [For PKI](use-cases/for-pki.md)
- [For Other Activities](use-cases/for-other-activities.md)

## Common paths

| Goal | Start here |
| --- | --- |
| Understand the product | [What is TKeeper?](overview/what-is-tkeeper.md) |
| Map it to your use case | [Use Cases](use-cases/README.md) |
| Run it locally | [Local Single Node](getting-started/local-single-node.md) |
| Build an artifact | [Build and Features](deployment/build-and-features.md) |
| Design backup and recovery | [Backup and Recovery](deployment/backup-and-recovery.md) |
| Choose mono or threshold | [Quorum Modes](security-model/quorum-modes.md) |
| Create and govern identities | [Create, Rotate, and Refresh](key-management/key-lifecycle.md) |
| Govern signing | [Authorities](signing-and-authorities/authorities.md) |
| Govern AP2 or MC VI payments | [Agentic Payment Authorities](signing-and-authorities/agentic-payments/README.md) |
| Connect an agent over MCP | [MCP connection and tools](signing-and-authorities/mcp.md) |
| Preview an authority-policy decision | [Dry Run Policy Evaluation](signing-and-authorities/dry-run.md) |
| Select cryptographic platforms | [Platforms](crypto-platforms/platforms.md) |
| Use the HTTP API | [OpenAPI](api-reference/openapi.md) |
| Run integration tests | [Integration Tests](operations/integration-tests.md) |
| Review executable security evidence | [Security Assurance](security-model/security-assurance.md) |

## By audience

| Reader | Recommended path |
| --- | --- |
| Application integrator | [Getting Started](getting-started/README.md) -> [Signing](signing-and-authorities/signing.md) -> [Java SDK](api-reference/sdk.md) or [OpenAPI](api-reference/openapi.md) |
| Security reviewer | [Security Model](security-model/README.md) -> [Threat Model](security-model/threat-model.md) -> [Security Assurance](security-model/security-assurance.md) -> [Status and Limitations](overview/status-and-limitations.md) |
| Platform operator | [Deployment](deployment/README.md) -> [Production Checklist](deployment/production-checklist.md) -> [Operations](operations/README.md) |
| Cryptography reviewer | [Crypto Platforms](crypto-platforms/README.md) -> [Quorum Modes](security-model/quorum-modes.md) -> [Anvil threat model](https://github.com/exploit-org/anvil/blob/main/THREAT_MODEL.md) |
