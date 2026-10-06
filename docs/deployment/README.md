# Deployment

Select the required features and algorithms when building the artifact, then initialize each node in mono or threshold mode. Configure authentication, TLS, sealing, and audit before accepting signing traffic.

Read:

- [Build and Features](build-and-features.md)
- [Configuration](configuration.md)
- [Initialization and Unseal](initialization-and-unseal.md)
- [Sealing and Unsealing](sealing-unsealing.md)
- [Clustering](clustering.md)
- [Backup and Recovery](backup-and-recovery.md)
- [Control Plane UI](control-plane-ui.md)
- [Production Checklist](production-checklist.md)

## Deployment shapes

| Shape | Use when | Key boundary |
| --- | --- | --- |
| Local mono | Development and demos | One local key identity |
| Production mono | Lower-impact workflows that accept single-node compromise | One node holds full key authority |
| Threshold cluster | High-risk workflows | Quorum of peers must authorize and participate |

Both modes use the same public API. Mono stores a full key on one host; threshold splits it across peers.

## Production defaults

For production:

- build only required features
- include recovery only in temporary maintenance artifacts and replace them after repair
- include every required platform explicitly
- use a production authenticator
- keep the internal API private to the cluster
- terminate public API access behind explicit network policy and rate limits
- configure audit sinks before relying on compliance evidence
- keep lifecycle/import/destroy permissions separate from signing
- use threshold mode for identities with real financial, security, or compliance consequences

Do not deploy the integration image. It includes test-only failure-injection controls.
