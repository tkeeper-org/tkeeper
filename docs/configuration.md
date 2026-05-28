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
- `http://...` or `https://...`

Multiple external locations are comma-separated. Earlier locations win because they are loaded first.

Profile config uses bundled files named `application-{profile}.conf`, `application-{profile}.json`, or `application-{profile}.properties`.

Dev auth config is separate. Enable it with:

```bash
-Dkeeper.dev.enabled=true
-Dkeeper.dev.config.location=/etc/tkeeper
```

When the dev location is a directory, TKeeper looks for `dev.conf`, `dev.json`, or `dev.properties`. A direct file path also works.

Example:

```bash
java \
  -Dkeeper.config.location=/etc/tkeeper \
  -Dkeeper.dev.config.location=/etc/tkeeper \
  -jar build/libs/tkeeper-2.0.0.jar
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
| `keeper.peers` | Other peers in the cluster; self is omitted |
| `keeper.providers.selected` | Seal provider id |
| `keeper.client.tls` | TLS for peer clients |
| `keeper.approval.ttl` | Four eye approval lifetime |
| `keeper.session.*` | DKG, FROST, GG20, ECIES, destroy session limits |

Coordinator-only endpoints can be disabled on a node:

```bash
-Dkeeper.coordinator.enabled=false
```

or:

```text
KEEPER_COORDINATOR_ENABLED=false
```

Use that for peers that only participate in threshold protocols.

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

Public and internal servers have separate TLS blocks:

```hocon
keeper.server.public.tls { enabled = true }
keeper.server.internal.tls { enabled = true }
```

The peer client must trust the internal server certificate when internal TLS is enabled:

```hocon
keeper.client {
  tls = true
  trust-store-path = "/etc/tkeeper/internal-truststore.p12"
  trust-store-password = "..."
}
```

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

  ecies {
    max-rounds = 3
  }
}
```

## Audit

Minimal file audit:

```hocon
keeper.audit {
  enabled = true
  timeout = 1000

  file {
    directory = "/var/lib/tkeeper/audit"
    extension = "ndjson"
  }
}
```

Socket audit supports TLS, SPKI pins, client certificates, batching, timeouts, and reconnect backoff. See [Audit Logging](audit-logging.md).

## ORAS

ORAS config is used by authority OCI pulls:

```hocon
oras {
  insecure = false
  username = "robot"
  password = "secret"
}
```

For HTTPS registries, set `insecure = false`. For a local plain HTTP registry, set `insecure = true`.

## UI CSP

The UI has its own CSP config under `keeper.csp`. See [Enabling UI](enabling-ui.md).

## Environment Aliases

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

## Frequent Problems

### Peer calls fail

Check `keeper.peers`. Each node lists the other peers, not itself.

### Authority OCI pull fails with TLS errors

Local registry over plain HTTP:

```hocon
oras { insecure = true }
```

Real registry over HTTPS:

```hocon
oras { insecure = false }
```
