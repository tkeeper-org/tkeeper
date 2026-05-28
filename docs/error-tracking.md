# Error Tracking (Sentry)

Sentry is initialized at startup if it is enabled.

Config fields:

```hocon
sentry {
  enabled = true
  dsn = "https://public@example.sentry.io/1"
  environment = "prod"
  release = "2.0.0"
}
```

Environment fallbacks:

```text
SENTRY_APPLICATION_ENVIRONMENT
SENTRY_APPLICATION_RELEASE
```

## Frequent Problems

### Sentry stays disabled

Check that `sentry.enabled` is `true` and that the DSN is valid.

### Bad DSN

The DSN must be `http` or `https`, include user info, include a host, and end with a numeric project id.
