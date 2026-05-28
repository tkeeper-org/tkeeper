# Enabling UI

The control-plane UI lives in `feature-ui`.

Build with it:

```bash
./gradlew shadowJar -Pkeeper.features=ui
```

Open:

```http
GET /ui/
```

Disable the UI at startup:

```bash
java \
  -Dkeeper.ui.enabled=false \
  -jar build/libs/tkeeper-2.0.0.jar
```

## Authentication

The UI uses the same external auth mode as the API.

With dev auth, the browser sends:

```text
X-DEV-TOKEN
```

With JWT auth, the browser sends:

```text
X-JWT-TOKEN
```

If `auth.jwt.oidc` is configured, the UI reads OIDC settings from:

```http
GET /v1/keeper/control/auth/config
```

## Content Security Policy

The UI feature adds security headers under `/ui`.

Default CSP:

```hocon
keeper.csp {
  default-src = ["'self'"]
  base-uri = ["'self'"]
  object-src = ["'none'"]
  frame-ancestors = ["'none'"]
  script-src = ["'self'"]
  style-src = ["'self'"]
  img-src = ["'self'", "data:"]
  font-src = ["'self'", "data:"]
  connect-src = ["'self'"]
  form-action = ["'self'"]
}
```

Report-only mode:

```hocon
keeper.csp {
  report-only = true
}
```

Extra origins:

```hocon
keeper.csp {
  connect-extra = [
    "https://issuer.example"
  ]

  form-action-extra = [
    "https://issuer.example"
  ]

  img-extra = [
    "https://assets.example"
  ]
}
```

OIDC origins are added to `connect-src` automatically when:

```hocon
keeper.csp {
  oidc-auto-connect = true
}
```

Set it to `false` when `connect-src` is managed manually.

## Headers

The UI also sends:

```text
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: geolocation=(), microphone=(), camera=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

When public TLS is enabled:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Frequent Problems

### `/ui/` returns 404

Rebuild with `feature-ui`.

### OIDC login cannot reach the issuer

Check `keeper.csp.connect-extra` or keep `keeper.csp.oidc-auto-connect = true`.

