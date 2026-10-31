# Control-plane clients

Keeper no longer serves a bundled browser UI. The `ui` build selector, `/ui/` routes,
and `keeper.ui` and `keeper.csp` settings have been removed. Host the operator interface
separately and connect it to the public API.

The core control plane provides:

| Endpoint | Result |
| --- | --- |
| `GET /v1/keeper/control/auth/config` | Public authentication and OIDC configuration |
| `GET /v1/keeper/control/capabilities` | Installed cryptographic algorithms and supported operations |
| `GET /v2/keeper/config` | Current quorum, loaded modules, authority types, and seal provider |
| `GET /v1/keeper/control/identities` | Active identities the caller may sign with |
| `GET /v1/keeper/control/identities/authority` | An attached authority's description and command schema |
| `GET /v1/keeper/control/me` | Current authenticated subject and permissions |

Except for public authentication configuration, these endpoints require the configured
primary authentication. Production clients send a JWT in `X-JWT-TOKEN` over HTTPS.
System and audit sink endpoints require their control-plane permissions.
Catalog access depends on signing permission for each key.

[Approvers](../api-reference/approvers.md) provides credential registration and metadata
management. WebAuthn finish requires both a valid primary token and the issued invitation.
The browser origin and RP ID must match the cluster's registration configuration.

Configure CSP, browser credential storage and OIDC callbacks on the external frontend.
Keeper does not supply browser security headers for that frontend. See
[authentication](../security-model/authentication-authorization.md) and the
[configuration API](../api-reference/configuration.md) for the remaining API contract.
