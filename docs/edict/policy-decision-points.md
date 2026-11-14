# Policy decision points

Use an external policy decision point (PDP) to check a shared quota before signing. The policy below caps each transfer at 499 USD and asks the PDP to check the remaining quota.

## Configure Keeper

Add the HTTPS origin of the PDP to `edict.pdp.allowed-origins` on every peer. Entries match the scheme, host, and port regardless of path. Omit the port to use 443. Use `https://*.example.com` to match one subdomain level. Keeper blocks PDP calls when the list is empty.

```hocon
edict.pdp {
  allowed-origins = ["https://pdp.example.com"]
  proxy {
    host = "egress.example.com"
    port = 3128
  }
}
```

Use an HTTP proxy that accepts `CONNECT` from Keeper without proxy credentials. Keeper verifies the TLS certificate for the PDP inside the tunnel. A proxy failure stops evaluation. Omit `proxy` for a direct connection.

## Call the PDP from a policy

```edict
authority "transfer" {
    intent = "custom"
    version = "1"

    input request { amount: Integer }

    pdp quota {
        endpoint = "https://pdp.example.com/v1"

        struct Transfer { amount: Integer }
        request reserve(transfers: List<Transfer>, currency: Text)
    }

    policy "transfer-limit" {
        let transfers = actions.map(action -> action.request)
        allow if (request.amount > 0 and request.amount < 500 and quota.reserve(transfers, "USD"))
    }
}
```

A `request` declares typed arguments and returns a Boolean. Structs declared inside a `pdp` block are local to that block. Request arguments can also use structs declared in the authority.

In this example, the amount checks run before `quota.reserve`. A PDP result can also trigger an approval, as in `require reviewer if (not quota.reserve(transfers, "USD"))`.

`actions` contains the inputs for all actions in the evaluation. Pass a batch in one call. Keeper reuses the result of an identical call during the evaluation and rejects a second call to the same PDP with a different method or different arguments.

## Handle requests

Keeper appends the request name to `endpoint` and sends a POST with `Content-Type: application/json`. The example calls `https://pdp.example.com/v1/reserve` with the declared parameters in `args`.

```json
{
  "args": {
    "currency": "USD",
    "transfers": [{"amount": 499}]
  },
  "opHash64": "jYYnlJi4YGPjj1jzcOeNVoREqzC/PGlTVnjUmMqT9L8=",
  "opId": "91f8cb1b-c9a8-47e5-ab5d-e6f428491723",
  "peerId": 1,
  "preview": false,
  "signature64": "<base64 integrity signature>"
}
```

Byte arguments use standard Base64. `Time` and `Duration` values use ISO 8601 strings.

Return HTTP 200 with exactly one Boolean field, `{"allow": true}` or `{"allow": false}`. A timeout, redirect, connection failure, or invalid reply stops evaluation with `PDP_UNAVAILABLE`.

The Boolean `preview` field tells the PDP why Keeper is evaluating the policy.

- `true` means Keeper is checking the policy without executing the operation. Dry runs
  use this value. So do requests to issue a mandate or prepare approvals. Return the
  decision without reserving quota or changing other state.
- `false` means Keeper is evaluating a request to execute the operation. The PDP may
  reserve quota. The operation can still fail after the PDP call.

Verify each peer's signature before using the `preview` flag or updating quota. Reject
requests with a missing or non-Boolean `preview` field. For execution requests, count
the operation once per `opId`. Reuse a decision only when the URL, `opHash64`, `args`,
and `preview` match the original call. Use `X-OP-ID` and `X-OP-HASH64` to match the
signing response to the PDP request.

### Verify the request signature

1. Keep the raw HTTP request body. Parse it as one JSON object and read `peerId` and `signature64`. Reject duplicate field names.
2. Get `unsignedBody`, the canonical UTF-8 JSON bytes of `args`, `opHash64`, `opId`, `peerId`, and `preview`. To rebuild these bytes from JSON, apply the following rules.

   - Sort each object's field names lexicographically by UTF-16 code units. Apply the same order to nested objects, including objects in arrays.
   - Keep array order and explicit `null` values. Preserve the original number tokens and string escapes.
   - Write UTF-8 JSON without whitespace between tokens.

   To use the raw body, remove the final `signature64` field and its preceding comma. Keep the closing `}`.

   ```json
   {"args":{"currency":"USD","transfers":[{"amount":499}]},"opHash64":"jYYnlJi4YGPjj1jzcOeNVoREqzC/PGlTVnjUmMqT9L8=","opId":"91f8cb1b-c9a8-47e5-ab5d-e6f428491723","peerId":1,"preview":false}
   ```

3. Set `url` to the full ASCII URL from `endpoint` with the request name appended. Preserve any explicit port and path escapes. The example uses `https://pdp.example.com/v1/reserve`.
4. Build the prefix, append `unsignedBody`, and hash the resulting bytes with SHA-256. Each `\n` is one line feed byte. Encode the 32-byte digest in standard Base64 as `data64`.

   ```text
   prefix = UTF8("TKEEPER_PDP_V1\n" + url + "\n")
   data64 = Base64(SHA-256(concat(prefix, unsignedBody)))
   ```

5. Look up the Keeper address for `peerId` in your trusted peer list. Send an authenticated `POST /v2/keeper/integrity/verify` to that Keeper with `data64` and the received `signature64`. The example produces this body.

   ```json
   {
     "data64": "kqh19zfy8Oi3pZ75Yc+GuhtAfMYHTFhklFClR4cjLe0=",
     "signature64": "<signature64 from the PDP request>"
   }
   ```

   Accept the request after Keeper returns HTTP 200 with `{"valid": true}`. Verification uses that peer's current integrity key.

## Limits

Set these options under `edict.pdp`. Edict's [execution limits](errors-and-limits.md#bounded-execution) also apply when evaluating arguments.

| Option | Default | Scope |
| --- | --- | --- |
| `connect-timeout` | 750 ms | Connection setup |
| `operation-timeout` | 2 s | Time for PDP calls in one evaluation, from the first call |
| `max-calls-per-operation` | 2 | Requests per peer per evaluation |
| `max-concurrent-requests` | 128 | Concurrent requests per peer |
| `max-request-bytes` | 64 KiB | Request body |
| `max-response-bytes` | 4 KiB | Response body |
