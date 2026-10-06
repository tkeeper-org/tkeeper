# CEL Functions

These functions are available in every authority policy. Each [authority type](authorities.md#intent-types) defines its own root variables. See the [typed authority example](authorities.md#custom-authority-example) for a policy and matching command.

## Standard CEL

Standard CEL operators and macros are available:

```cel
roles.exists(role, role == 'admin')
roles.all(role, role != 'banned')
has(resource.ownerId)
```

The Google CEL list extension is enabled:

```cel
[1, 2, 3].reverse()[0] == 3
[1, 2, 3, 4].slice(1, 3) == [2, 3]
```

Missing roots fail strict policy compilation. Missing nested values fail evaluation unless the expression guards their presence:

```cel
'plan' in subject.account && subject.account.plan == 'pro'
```

## Effect helpers

Inputs are lists of maps. Every effect contains a `type` field.

```cel
effect.onlyTypes(effects, ['deployment.release']) &&
effect.one(effects, 'deployment.release') &&
effect.any(effects, 'deployment.release', {
  'service': expectedService,
  'environment': 'production'
}) &&
bigint.gte(effect.sum(effects, 'deployment.release', 'sequence'), minimumSequence)
```

| Function | Result |
| --- | --- |
| `effect.types(effects)` | effect type strings in input order |
| `effect.has(effects, type)` | at least one effect has `type` |
| `effect.none(effects, type)` | no effect has `type` |
| `effect.one(effects, type)` | exactly one effect has `type` |
| `effect.count(effects, type)` | number of effects with `type` |
| `effect.of(effects, type)` | effects with `type` |
| `effect.onlyTypes(effects, allowedTypes)` | every effect type belongs to `allowedTypes` |
| `effect.any(effects, type, criteria)` | at least one matching effect contains every field in `criteria` |
| `effect.all(effects, type, criteria)` | at least one effect has `type` and all effects of that type match `criteria` |
| `effect.values(effects, type, field)` | values of `field`; missing fields are skipped |
| `effect.amount(effects, type)` | sum of `amount` for matching effects as `BigInteger` |
| `effect.sum(effects, type, field)` | sum of a numeric field as `BigInteger` |

`effect.amount` and `effect.sum` fail evaluation when a matching effect lacks the summed field.

## Decimal helpers

Accepted inputs: `BigDecimal`, `BigInteger`, finite Java numbers, CEL `int` and `double`, and decimal strings.

```cel
decimal.eq(decimal.add(balance, fee), '0.30')
decimal.between(amount, '10.00', '100.00')
decimal.round(amount, 2)
```

| Function | Result |
| --- | --- |
| `decimal.from(value)` | convert to `BigDecimal` |
| `decimal.compare(left, right)` | `-1`, `0`, or `1` |
| `decimal.eq(left, right)` | equal while ignoring scale |
| `decimal.ne(left, right)` | unequal |
| `decimal.gt(left, right)` | `left > right` |
| `decimal.gte(left, right)` | `left >= right` |
| `decimal.lt(left, right)` | `left < right` |
| `decimal.lte(left, right)` | `left <= right` |
| `decimal.between(value, min, max)` | inclusive range |
| `decimal.add(left, right)` | addition |
| `decimal.sub(left, right)` | subtraction |
| `decimal.mul(left, right)` | multiplication |
| `decimal.div(left, right)` | `DECIMAL128` division; zero divisor fails evaluation |
| `decimal.round(value, scale)` | `HALF_UP` rounding |
| `decimal.abs(value)` | absolute value |

## Bigint helpers

Accepted inputs: `BigInteger`, exact integral `BigDecimal`, integral Java numbers, CEL `int`, and integer strings.

```cel
bigint.gt(counter, '9223372036854775808')
bigint.eq(bigint.mod(counter, 10), 9)
```

| Function | Result |
| --- | --- |
| `bigint.from(value)` | convert to `BigInteger`; fractional values fail evaluation |
| `bigint.compare(left, right)` | `-1`, `0`, or `1` |
| `bigint.eq(left, right)` | equality |
| `bigint.ne(left, right)` | inequality |
| `bigint.gt(left, right)` | `left > right` |
| `bigint.gte(left, right)` | `left >= right` |
| `bigint.lt(left, right)` | `left < right` |
| `bigint.lte(left, right)` | `left <= right` |
| `bigint.between(value, min, max)` | inclusive range |
| `bigint.add(left, right)` | addition |
| `bigint.sub(left, right)` | subtraction |
| `bigint.mul(left, right)` | multiplication |
| `bigint.mod(left, right)` | remainder; zero divisor fails evaluation |
| `bigint.abs(value)` | absolute value |

## List helpers

Inputs may be Java collections, Java arrays, or CEL lists. Membership compares numeric values independently of their Java wrapper types.

```cel
lists.containsAny(subject.account.scopes, ['admin', 'billing'])
lists.hasOnly(roles, allowedRoles)
lists.nonEmpty(lists.without(roles, ['viewer']))
```

| Function | Result |
| --- | --- |
| `lists.isEmpty(value)` | list has no elements |
| `lists.nonEmpty(value)` | list has at least one element |
| `lists.size(value)` | element count |
| `lists.first(value)` | first element; empty lists fail evaluation |
| `lists.last(value)` | last element; empty lists fail evaluation |
| `lists.contains(values, candidate)` | any element equals `candidate` |
| `lists.containsAny(values, candidates)` | at least one candidate exists in `values` |
| `lists.containsAll(values, candidates)` | every candidate exists in `values` |
| `lists.containsNone(values, candidates)` | no candidate exists in `values` |
| `lists.hasOnly(values, allowed)` | every value exists in `allowed` |
| `lists.concat(left, right)` | concatenated list |
| `lists.without(values, excluded)` | values absent from `excluded` |
| `lists.distinct(values)` | first occurrence of each value |

## Network helpers

`ip.*` accepts IP strings, `InetAddress`, and raw bytes. Invalid IP values return `false`.

```cel
ip.isPrivate(request.ip)
cidr.matches(request.ip, '10.0.0.0/8')
cidr.matchesAny(request.ip, allowedCidrs)
```

| Function | Result |
| --- | --- |
| `ip.isValid(value)` | valid IPv4 or IPv6 |
| `ip.isV4(value)` | IPv4 |
| `ip.isV6(value)` | IPv6 |
| `ip.isPrivate(value)` | RFC1918 IPv4 or unique-local IPv6 |
| `ip.isPublic(value)` | public address excluding invalid, private, loopback, link-local, reserved, multicast, and documentation ranges |
| `ip.isLoopback(value)` | loopback address |
| `ip.isLinkLocal(value)` | IPv4 `169.254.0.0/16` or IPv6 `fe80::/10` |
| `cidr.matches(ip, cidr)` | IP belongs to CIDR |
| `cidr.matchesAny(ip, cidrs)` | IP belongs to any CIDR; accepts a list, array, string, or comma-separated string |
| `cidr.contains(cidr, ipOrCidr)` | first CIDR contains an IP or another CIDR |

Invalid CIDR inputs return `false`.

## Semver helpers

Semver parsing supports prerelease ordering, ignored build metadata, an optional `v` prefix, and missing minor or patch components as zero.

```cel
semver.gte(app.version, '1.4.0')
semver.lt(app.version, '2.0.0-beta')
semver.between(app.version, '1.4.0', '1.5.0')
```

| Function | Result |
| --- | --- |
| `semver.isValid(value)` | accepted Semver string |
| `semver.compare(left, right)` | `-1`, `0`, or `1` |
| `semver.eq(left, right)` | equality |
| `semver.ne(left, right)` | inequality |
| `semver.gt(left, right)` | `left > right` |
| `semver.gte(left, right)` | `left >= right` |
| `semver.lt(left, right)` | `left < right` |
| `semver.lte(left, right)` | `left <= right` |
| `semver.between(value, min, max)` | inclusive range |

## Crypto helpers

Byte inputs may be `byte[]`, `ByteBuffer`, `UUID`, collections, or arrays of byte values. String inputs use UTF-8 unless a function documents normalization.

```cel
crypto.sha256(subject.email) == expectedHash
crypto.digest(payload, 'sha-512') == expectedDigest
crypto.uuidEq(request.id, expectedRequestId)
```

| Function | Result |
| --- | --- |
| `crypto.digest(value, algorithm)` | hexadecimal digest; accepts normalized algorithm spellings such as `sha_256`, `sha-256`, and `SHA-256` |
| `crypto.sha256(value)` | SHA-256 hexadecimal digest |
| `crypto.sha512(value)` | SHA-512 hexadecimal digest |
| `crypto.md5(value)` | MD5 hexadecimal digest |
| `crypto.hex(value)` | hexadecimal bytes; existing hex strings normalize to lowercase |
| `crypto.isHex(value)` | valid even-length hexadecimal string after normalization |
| `crypto.uuid(value)` | canonical lowercase UUID |
| `crypto.isUuid(value)` | UUID parse succeeds |
| `crypto.uuidEq(left, right)` | normalized UUID equality; invalid values return `false` |

## Time helpers

Inputs may be `Instant`, `Date`, `Calendar`, `OffsetDateTime`, `ZonedDateTime`, UTC `LocalDateTime`, UTC-start-of-day `LocalDate`, ISO/RFC-1123 strings, epoch seconds, or epoch milliseconds.

```cel
time.after(time.now(), subject.createdAt)
time.before(request.createdAt, request.expiresAt)
time.ageMinutes(subject.createdAt, time.now()) < 30
```

| Function | Result |
| --- | --- |
| `time.now()` | current UTC `Instant` |
| `time.parse(value)` | convert to `Instant` |
| `time.before(left, right)` | `left < right` |
| `time.after(left, right)` | `left > right` |
| `time.between(value, start, end)` | inclusive range |
| `time.durationSeconds(start, end)` | whole seconds from start to end; may be negative |
| `time.ageSeconds(timestamp, now)` | whole seconds from timestamp to now |
| `time.ageMinutes(timestamp, now)` | whole minutes from timestamp to now |
| `time.ageHours(timestamp, now)` | whole hours from timestamp to now |
| `time.ageDays(timestamp, now)` | whole days from timestamp to now |

Numeric epochs with absolute values below `10_000_000_000` are seconds. Larger values are milliseconds.
