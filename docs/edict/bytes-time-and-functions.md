# Bytes, time, and module functions

Use `Bytes` for binary data, `Time` for a point on the UTC timeline, and `Duration` for elapsed time. These values are immutable. Keeper includes the conversions and methods below, along with text methods and SHA-256.

## Byte values

Write a hexadecimal byte literal with the `b` prefix:

```edict
let marker: Bytes = b"deadbeef"
let empty: Bytes = b""
```

Each pair of hexadecimal digits represents one byte. Both letter cases are accepted. The literal requires complete pairs, without a `0x` prefix, spaces, or string escapes.

| Expression | Result |
| --- | --- |
| `payload.count()` | Number of bytes as `Integer` |
| `payload[0]` | First byte as an `Integer` from 0 through 255 |
| `payload.slice(start, end)` | Bytes from `start`, inclusive, to `end`, exclusive |
| `payload.contains(marker)` | Whether the contiguous byte sequence occurs |
| `payload.startsWith(marker)` | Whether the sequence is a prefix |
| `payload.endsWith(marker)` | Whether the sequence is a suffix |
| `payload + other` | Concatenated `Bytes` |
| `payload == other` | Equality of byte contents |

Indexes start at zero. A slice requires `0 <= start <= end <= payload.count()`. Invalid indexes and slice bounds fail evaluation. An empty search sequence matches every byte value, including empty bytes.

Conversions are explicit:

```edict
Bytes.fromHex("deadbeef")
Bytes.fromBase64("3q2+7w==")
Bytes.fromUtf8("hello")
b"deadbeef".toHex()
b"deadbeef".toBase64()
b"68656c6c6f".toUtf8()
crypto.sha256(b"68656c6c6f")
```

`toHex()` returns lowercase digits without a prefix. Base64 uses the standard alphabet and canonical padding. `toUtf8()` rejects malformed UTF-8. Hash functions accept and return `Bytes`.

## Text methods

`Text` supports `count()`, indexing, `slice(start, end)`, `contains(text)`, `startsWith(text)`, and `endsWith(text)`.

Counts, indexes, and slice bounds use Unicode code points. `"a😀é".count()` is 3, and `"a😀é".slice(1, 2)` is `"😀"`. Combining marks remain separate code points. Comparisons and searches preserve case and Unicode spelling.

Searches match literal text. Regular expressions are unavailable.

## Time and duration

Construct a time from an ISO timestamp with an explicit UTC offset, Unix seconds, or Unix milliseconds:

```edict
Time.parse("2026-11-01T10:00:00Z")
Time.seconds(0)
Time.millis(1500)
```

`Time.seconds(value)` and `Time.millis(value)` accept exact numbers, including fractions. Values must fit nanosecond precision and the supported time range. A value finer than one nanosecond fails. `time.toSeconds()` and `time.toMillis()` return exact `Number` values. `time.toText()` returns a UTC ISO timestamp.

Create a duration with `Duration.millis(value)`, `Duration.seconds(value)`, `Duration.minutes(value)`, `Duration.hours(value)`, or `Duration.days(value)`. A day is exactly 86,400 seconds. Durations support `toSeconds()` and `toMillis()`.

| Operation | Result |
| --- | --- |
| `time - earlier` | `Duration` |
| `time + duration` | `Time` |
| `time - duration` | `Time` |
| `duration + time` | `Time` |
| `duration + other` | `Duration` |
| `duration - other` | `Duration` |
| `-duration` | Negated `Duration` |
| `<`, `<=`, `>`, `>=` | Compare two times or two durations |

`Time.now()` reads the current time once per policy evaluation. Every call in one evaluation, including every action in a batch, reads the same value. It is unavailable in authority constants, defaults, and other compile-time expressions.

Calendar methods require a time zone:

```edict
Time.now().hour("Asia/Dubai")
Time.now().dayOfWeek("UTC")
Time.now().startOfDay("America/New_York")
```

`hour(zone)` returns an integer from 0 through 23. `dayOfWeek(zone)` returns an uppercase name such as `"MONDAY"`. `startOfDay(zone)` returns the first valid time of the local date. Calendar boundaries follow the zone's daylight saving rules. Elapsed durations retain their fixed length.

## Custom JSON inputs

A JSON `Bytes` field accepts a Base64 string. A `Time` field accepts an ISO timestamp with an explicit offset. A `Duration` field accepts an ISO duration such as `"PT5M"`.

This policy permits a payload with the required prefix while its expiry is at most one hour away:

```edict
authority "payload-window" {
    intent = "custom"
    version = "1"

    input request {
        payload: Bytes
        expiresAt: Time
    }

    policy "payload-window" {
        let now = Time.now()

        allow when {
            request.payload.startsWith(b"deadbeef")
            now < request.expiresAt
            request.expiresAt - now <= Duration.hours(1)
        }
    }
}
```

The matching `artifact.typed` uses this JSON:

```json
{"payload":"3q2+7w==","expiresAt":"2026-11-01T11:00:00Z"}
```

EVM `bytes` and `bytesN`, Solana `bytes`, and Soroban `bytes` arguments expose `Bytes`. EVM fixed byte arguments retain their declared length. X.509 validity fields expose optional `Time` values.

## Protocol functions

Protocol functions are available when Keeper is built with the corresponding feature. See [Build and features](../deployment/build-and-features.md) to select features.

| Keeper feature | Functions |
| --- | --- |
| Included in every build | `Bytes` conversions and methods, text methods, `Time`, `Duration`, `crypto.sha256(bytes)` |
| `evm` | `evm.validAddress(text)`, `evm.addressEquals(left, right)`, `crypto.keccak256(bytes)` |
| `bitcoin` | `bitcoin.validAddress(text, network)` |
| `agentic-payments` | `payment.minorUnits(amount, currency)`, `payment.currencyScale(currency)`, `payment.matchesIdentity(actual, expected)` |

EVM validation checks address syntax and mixed-case checksums. `addressEquals` validates both operands before comparing their addresses. Bitcoin validation checks the address checksum and the network argument, such as `"mainnet"` or `"testnet"`.

Payment amounts use quoted decimal text and an ISO currency code. `payment.minorUnits("50.00", "USD")` returns the integer 5000. Excess fractional digits and unknown currencies fail. Identity matching checks the configured `id` and `website`, or the payment instrument's `id` and `type`. It compares every configured field.

## Limits

Byte values, searches, conversions, and intermediate results share the policy's resource limits. Invalid encodings, unsupported time values, or exhausted limits fail evaluation. See [Errors and execution limits](errors-and-limits.md).
