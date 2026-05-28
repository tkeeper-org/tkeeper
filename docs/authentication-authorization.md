# Authentication & Authorization

External requests are authenticated before the controller runs.

Supported auth types:

| Type | Header | Use |
| --- | --- | --- |
| `dev` | `X-DEV-TOKEN` | development |
| `jwt` | `X-JWT-TOKEN` | real deployments |

Dev auth needs a separate dev config file. It is loaded from `keeper.dev.config.location`.

Example `dev.conf`:

```hocon
keeper {
  dev {
    token = "dev-token"
    permissions = [
      "tkeeper.system.init",
      "tkeeper.system.unseal",
      "tkeeper.dkg.create",
      "tkeeper.dkg.rotate",
      "tkeeper.dkg.refresh",
      "tkeeper.key.*.public",
      "tkeeper.key.*.sign",
      "tkeeper.key.*.verify",
      "tkeeper.key.*.destroy",
      "tkeeper.storage.write",
      "tkeeper.compliance.inventory"
    ]
  }
}
```

JWT auth:

```hocon
auth {
  type = "jwt"

  jwt {
    jwks-location = "https://issuer.example/.well-known/jwks.json"
    audience = "tkeeper"
    refresh = 15m
  }
}
```

JWT tokens must contain:

- `sub`
- `aud`
- `permissions` as a string list claim

`aud` may be a single value or an array. TKeeper checks that it contains `auth.jwt.audience`.

TKeeper does not validate issuer directly. Trust is anchored in the configured JWKS and audience.

Common permissions:

| Permission | Allows |
| --- | --- |
| `tkeeper.system.init` | initialize keeper |
| `tkeeper.system.unseal` | unseal |
| `tkeeper.system.seal` | seal |
| `tkeeper.dkg.create` | create a key |
| `tkeeper.dkg.rotate` | rotate a key |
| `tkeeper.dkg.refresh` | refresh shares |
| `tkeeper.key.{keyId}.public` | read public key |
| `tkeeper.key.{keyId}.sign` | sign |
| `tkeeper.key.{keyId}.verify` | verify |
| `tkeeper.key.{keyId}.encrypt` | ECIES encrypt |
| `tkeeper.key.{keyId}.decrypt` | ECIES decrypt |
| `tkeeper.key.{keyId}.destroy` | destroy key |
| `tkeeper.storage.write` | trusted-dealer import |
| `tkeeper.consistency.fix` | run consistency fix |
| `tkeeper.integrity.rotate` | rotate audit integrity key |
| `tkeeper.audit.log.verify` | verify signed audit log lines |
| `tkeeper.compliance.inventory` | read asset inventory |
| `tkeeper.control.system` | read control-plane system state |
| `tkeeper.control.sinks` | read audit sink state |
| `tkeeper.expired.view` | view expired key material where supported |

Wildcards are supported:

```text
tkeeper.key.*.sign
tkeeper.key.*.*
```

Wildcards match dot-separated permission segments. `tkeeper.key.*.sign` matches `tkeeper.key.wallet.sign`, but not `tkeeper.key.team.wallet.sign`.

Negative permissions start with `-`. They remove access granted by a broader permission:

```text
tkeeper.key.*.sign
-tkeeper.key.hot-wallet.sign
```

This grants signing on all one-segment key ids except `hot-wallet`.

## Internal Peer Auth

Peer-to-peer calls use TKeeper's internal request signing. This is separate from public API auth.

Each internal request carries:

```text
X-INSTANCE-ID
X-INTENDED-FOR
X-TIMESTAMP
X-NONCE
X-KEY-ID
X-PUBLIC-KEY
X-BOOT-PROOF
X-SIGNATURE
```

The request is signed by the peer's internal Ed25519 key. The nonce must be unique and the timestamp must be fresh. On first contact, a peer proves its key with the shared bootstrap token. After that, the public key is pinned.

Internal TLS can still be enabled, but it is transport security. Peer authorization is the signed-request layer.

## Frequent Problems

### `UNAUTHENTICATED`

The token is missing, invalid, or signed by a key that is not in JWKS.

### `ACCESS_DENIED`

The token is valid, but the `permissions` claim does not allow this operation.

Check negative permissions too. A matching `-permission` wins over a broad grant.
