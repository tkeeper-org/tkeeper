# Configuration

TKeeper reads config in this order:

1. JVM system properties
2. external config from `KEEPER_CONFIG_LOCATION` or `-Dkeeper.config.location`
3. profile config from `KEEPER_PROFILE` or `-Dkeeper.profile`
4. bundled `application.conf`
5. bundled `reference.conf`

External config can be:

- a file
- a directory with `application.conf`, `application.json`, or `application.properties`
- `classpath:...`

Multiple external locations are comma-separated. Earlier locations win because they are loaded first.

Configuration may contain bootstrap tokens or HSM PINs as well as registry credentials and trust-store passwords. Restrict access to these files and keep them out of source control. Inject secrets through the deployment's protected configuration mechanism. Do not expose resolved configuration in logs or support bundles.

Profile config uses bundled files named `application-{profile}.conf`, `application-{profile}.json`, or `application-{profile}.properties`.

Dev auth config is separate. Include the feature when building:

```bash
./gradlew :build -Pkeeper.features=auth-dev -Pkeeper.platforms=ecc
```

Enable it at runtime with:

```bash
-Dkeeper.dev.enabled=true
-Dkeeper.dev.config.location=/etc/tkeeper
```

`auth-dev` is not included by `keeper.features=all`. It must be selected explicitly.

When the dev location is a directory, TKeeper looks for `dev.conf`, `dev.json`, or `dev.properties`. A direct path also works.

Example:

```bash
java \
  -Dkeeper.config.location=/etc/tkeeper \
  -Dkeeper.dev.config.location=/etc/tkeeper \
  -jar build/libs/tkeeper-3.1.0.jar
```

Minimal node config:

```hocon
auth { type = "dev" }

boot { token = "change-me" }

keeper {
  database { path = "/var/lib/tkeeper/db" }

  providers {
    selected = "shamir"
    shamir {
      total = 5
      threshold = 3
    }
  }

  server {
    public {
      host = "0.0.0.0"
      port = 8080
    }

    internal {
      host = "0.0.0.0"
      port = 9090
    }
  }

  peers = [
    { id = 2, internal-url = "http://keeper-2:9090" },
    { id = 3, internal-url = "http://keeper-3:9090" }
  ]
}
```

Common fields:

| Field | Meaning |
| --- | --- |
| `keeper.database.path` | RocksDB path |
| `keeper.server.public` | API users call this |
| `keeper.server.internal` | Peers call this |
| `keeper.peers` | Other peers in the cluster. Self is omitted |
| `keeper.providers.selected` | Seal provider id |
| `keeper.client.tls` | TLS for peer clients |
| `keeper.recovery` | Recovery-only runtime mode. Defaults to `false` |
| `keeper.authority.arbitrary.enabled` | Enables raw `arbitrary` signing. Defaults to `false` |
| `keeper.approval.ttl` | Four-eye approval lifetime |
| `keeper.webauthn.enabled` | Enables approver registration. Defaults to `false` |
| `keeper.webauthn.rp-id`, `rp-name`, `origins` | Registration RP and exact browser origins |
| `keeper.webauthn.registration-ttl` | Registration session lifetime. Defaults to `5m`, positive and at most `10m` |
| `keeper.nonce-ttl` | Persistent nonce replay retention and FIFO file TTL. Defaults to `12h` (`KEEPER_NONCE_TTL`) |
| `keeper.mandate.max-ttl` | Maximum mandate lifetime. Defaults to the smaller of `15m` and nonce retention |
| `keeper.mandate.max-attempts` | Maximum protocol attempts per mandate. Defaults to `12`, range `1` to `1024` |
| `keeper.session.*` | DKG, FROST, GG20, ML-DSA, ECIES, destroy session limits |

WebAuthn registration requires the ECC platform's P256 provider. Configure the RP ID and exact
frontend origins consistently on every peer. They describe the approval frontend, not the Keeper
API hostname. The [registration guide](../api-reference/approvers.md#register-webauthn-from-a-hub)
contains a complete example.

`keeper.webauthn.enabled` controls registration. Approval assertions use the RP ID, origins and
credential parameters pinned in the key policy or registry descriptor. Disabling registration or
changing its origins does not revoke existing approval credentials. Changing a pinned credential
requires a new descriptor and REFRESH/ROTATE under the current policy.

`keeper.nonce-ttl` must be strictly greater than `keeper.approval.ttl` and the internal
authentication replay window of 60 seconds (a timestamp can be accepted up to 30 seconds
before and after its value). Invalid combinations are rejected when the keeper config is created.
Physical FIFO cleanup is asynchronous and can occur after the configured TTL.

Raw `arbitrary` signing must be enabled explicitly and consistently on every keeper in the cluster:

```hocon
keeper.authority.arbitrary.enabled = true
```

The equivalent environment variable is `KEEPER_AUTHORITY_ARBITRARY_ENABLED`. Leave the setting
turned off when every key uses a concrete OCI authority.

Coordinator-only endpoints can be turned off on a node:

```bash
-Dkeeper.coordinator.enabled=false
```

or:

```text
KEEPER_COORDINATOR_ENABLED=false
```

Use that for peers that only participate in threshold protocols.

`keeper.recovery=true` is fail-closed maintenance mode. Build the artifact with
`-Pkeeper.features=recovery` and the required platform selectors. The mode requires the recovery
feature in the artifact, public TLS, internal mTLS with client authentication, outbound client mTLS,
and a distinct `tls-spki-sha256` binding for every peer. Normal key operations and readiness are
blocked until the keeper is restarted with recovery turned off. See
[Backup and Recovery](backup-and-recovery.md).

After repair, replace the maintenance artifact with a production build that does not include the
`recovery` feature. Do not use the runtime flag as the only recovery deactivation step.

## Request bodies

Public and internal servers have separate limits for reading request bodies:

```hocon
keeper.server.public.request-body-timeout = 10s
keeper.server.public.request-body-max-timeout = 30s
keeper.server.public.request-body-min-rate = 1024

keeper.server.internal.request-body-timeout = 10s
keeper.server.internal.request-body-max-timeout = 30s
keeper.server.internal.request-body-min-rate = 1024
```

`request-body-timeout` sets the initial read timeout after the headers are parsed.
`request-body-min-rate` specifies how many bytes must be read to add one second, up to
`request-body-max-timeout` in total. With the defaults, reading 1 KiB extends the timeout
by one second, with a maximum of 30 seconds from the start of the request.

All values must be positive. The maximum must be at least the initial timeout.
Set both timeouts equal to use a fixed deadline.

The public environment overrides are `KEEPER_REQUEST_BODY_TIMEOUT`,
`KEEPER_REQUEST_BODY_MAX_TIMEOUT`, and `KEEPER_REQUEST_BODY_MIN_RATE`. The internal overrides
use the `KEEPER_INTERNAL_` prefix instead of `KEEPER_`.

Server-side delays before reading the body count toward the timeout. The limit also covers
bodies left unread after an early response. Once the body is fully read, the operation can
continue independently of this deadline. A timeout closes the connection. For HTTP/2 this
also ends other streams on that connection.

## Server TLS

TLS can use a keystore:

```hocon
keeper.server.public.tls {
  enabled = true
  key-store-path = "/etc/tkeeper/public.p12"
  key-store-password = "..."
  key-store-type = "PKCS12"
}
```

or certificate files:

```hocon
keeper.server.public.tls {
  enabled = true
  certificate-chain-path = "/etc/tkeeper/tls.crt"
  private-key-path = "/etc/tkeeper/tls.key"
}
```

When PEM refresh is enabled, TKeeper validates that the candidate private key matches the leaf
certificate before publishing it. A partial, malformed, or mismatched update is logged and the last
valid identity remains active until both files form a valid pair.

Public and internal servers have separate TLS blocks:

```hocon
keeper.server.public.tls { enabled = true }
keeper.server.internal.tls { enabled = true }
```

JWT authentication requires public-server TLS and fails startup when it is turned off.

The peer client must trust the internal server certificate when internal TLS is enabled:

```hocon
keeper.client {
  tls = true
  request-timeout = 30s
  connect-timeout = 500ms
  trust-store-path = "/etc/tkeeper/internal-truststore.p12"
  trust-store-password = "..."
}
```

For mutual TLS, require client certificates on every internal server and configure the peer client key store:

```hocon
keeper.server.internal.tls {
  enabled = true
  client-auth = true
  trust-store-path = "/etc/tkeeper/peer-ca.p12"
  trust-store-password = "..."
  trust-store-type = "PKCS12"
}

keeper.client {
  tls = true
  trust-store-path = "/etc/tkeeper/internal-truststore.p12"
  trust-store-password = "..."
  key-store-path = "/etc/tkeeper/peer-client.p12"
  key-store-password = "..."
  key-store-type = "PKCS12"
}
```

`keeper.client.request-timeout` is the total peer request deadline and must be positive. `connect-timeout` may impose a shorter connection deadline. `0ms` leaves connection setup bounded by the total request deadline.

All configuration timeouts accept HOCON durations, such as `500ms`, `30s`, or `2m`.
Values without units remain milliseconds for compatibility (`30000` means `30s`), but that
notation is deprecated. Use `0ms` only for settings that explicitly support disabling the timeout.

Give every peer a distinct client certificate, then bind its configured peer id to that certificate's SPKI digest:

```hocon
keeper.peers = [
  {
    id = 2
    internal-url = "https://keeper-2:9090"
    tls-spki-sha256 = "base64-sha256-of-peer-2-client-certificate-spki"
  }
]
```

Compute the value from the client certificate:

```bash
openssl x509 -in peer-2-client.crt -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl base64 -A
```

If one peer entry has `tls-spki-sha256`, every peer entry must have a valid, distinct pin. TKeeper also requires internal TLS client authentication and an outbound client key store in that configuration.

mTLS restricts internal API access and protects forwarded actor credentials from network interception. With SPKI pins configured, it also binds the claimed peer id to its certificate. TKeeper still verifies signatures over peer requests because TLS does not bind protocol messages to TKeeper sessions.

Outside dev mode, protected peer protocol routes reject plaintext even if request signatures are otherwise valid. Health and integrity-public-key discovery remain available for deployment health checks and enrollment.

## Authentication

JWT authentication is configured under `auth.jwt`:

```hocon
auth {
  type = "jwt"

  jwt {
    jwks-location = "https://issuer.example/.well-known/jwks.json"
    issuer = "https://issuer.example"
    audience = "tkeeper"
    refresh = 15m
    clock-skew = 15s
  }
}
```

When `issuer` is configured, it must match the token `iss` claim. Configure it in production to bind tokens to the expected identity provider.

`audience` must be present in the token `aud` claim. Tokens must contain `exp`. `nbf` is honored when present.

`clock-skew` defaults to `15s` and must not be negative.

Remote `jwks-location` and OIDC discovery URLs must use HTTPS. A local JWKS path or
`file:` URI is also supported. OIDC callbacks must use HTTPS, except for loopback callbacks
used during local development.

## Sessions

Session limits live under `keeper.session`:

```hocon
keeper.session {
  dkg { expire = 5m }
  destroy { expire = 5m }

  frost {
    expire = 5m
    max-rounds = 5
  }

  gg20 {
    expire = 15m
    max-rounds = 3
  }

  mldsa {
    expire = 5m
    max-rounds = 12
  }

  ecies {
    max-rounds = 3
  }
}
```

For ML-DSA, `max-rounds` is the maximum number of complete signing attempts, not the number of protocol messages and not the internal parallel-instance count `K`. Each attempt has three signing rounds and may stop during rejection sampling. The default of `12` bounds latency. Exhausting it returns `SESSION_MAX_ROUNDS_EXCEEDED` and does not identify a dead or malicious peer. Increase it only together with an end-to-end request deadline and latency monitoring.

## Audit

Minimal file audit:

```hocon
keeper.audit {
  enabled = true
  timeout = 1s

  file {
    directory = "/var/lib/tkeeper/audit"
    extension = "ndjson"
  }
}
```

Socket audit supports TLS, SPKI pins, client certificates, batching, timeouts, and reconnect backoff. See [Audit Logging](../security-model/audit-logging.md).

## ORAS

Configure registry access for OCI authorities:

```hocon
oras {
  insecure = false
  allowed-registries = ["registry.example.com"]
  username = "robot"
  password = "secret"

  registries {
    "registry.example.com" {
      token-origins = ["https://auth.example.com"]
      download-origins = ["https://storage.example.com"]
    }
  }
}
```

`allowed-registries` is mandatory for OCI authorities and matches the exact registry authority, including the port. An empty list denies all OCI pulls. HTTPS is the default. Use `insecure = true` only for an explicitly allowed local plain HTTP registry.

Use `registries` when a registry issues Bearer challenges through a separate token
service or redirects blob downloads to another origin. Quote each registry key and use the exact host and optional port from the OCI reference.
Omit the scheme and path, and add the registry separately to `allowed-registries`.

Origins contain only a scheme, host, and optional port. Token origins may receive configured registry credentials, while download origins receive
blob redirects without those credentials. The lists are independent and apply only to their
registry, and default to empty. The registry's own origin remains trusted.
Other origins are rejected unless listed. HTTP origins require `insecure = true`.

## External control-plane clients

The bundled UI and its `keeper.csp` configuration have been removed. Configure browser
security headers on the server hosting your frontend. See [Control-plane clients](control-plane-ui.md)
for the available discovery APIs and authentication requirements.

## Environment aliases

Common environment variables:

| Variable | Config field |
| --- | --- |
| `KEEPER_AUTH_TYPE` | `auth.type` |
| `KEEPER_BOOT_TOKEN` | `boot.token` |
| `KEEPER_DATABASE_PATH` | `keeper.database.path` |
| `KEEPER_AUDIT_ENABLED` | `keeper.audit.enabled` |
| `KEEPER_SEAL_SELECTED` | `keeper.providers.selected` |
| `KEEPER_SEAL_SHAMIR_TOTAL` | `keeper.providers.shamir.total` |
| `KEEPER_SEAL_SHAMIR_THRESHOLD` | `keeper.providers.shamir.threshold` |
| `KEEPER_HOST` | `keeper.server.public.host` |
| `KEEPER_PORT` | `keeper.server.public.port` |
| `KEEPER_INTERNAL_HOST` | `keeper.server.internal.host` |
| `KEEPER_INTERNAL_PORT` | `keeper.server.internal.port` |
| `KEEPER_TLS_ENABLED` | `keeper.server.public.tls.enabled` |
| `KEEPER_INTERNAL_TLS_ENABLED` | `keeper.server.internal.tls.enabled` |
| `KEEPER_CLIENT_TLS` | `keeper.client.tls` |
| `KEEPER_INTERNAL_TLS_CLIENT_AUTH` | `keeper.server.internal.tls.client-auth` |
| `KEEPER_INTERNAL_TLS_TRUST_STORE_PATH` | `keeper.server.internal.tls.trust-store-path` |
| `KEEPER_CLIENT_KEY_STORE_PATH` | `keeper.client.key-store-path` |

## Common problems

### Peer calls fail

Check `keeper.peers`. Each node lists the other peers, not itself.

### Authority OCI pull fails with TLS errors

Local registry over plain HTTP:

```hocon
oras {
  insecure = true
  allowed-registries = ["registry:5000"]
}
```

Real registry over HTTPS:

```hocon
oras {
  insecure = false
  allowed-registries = ["registry.example.com"]
}
```
