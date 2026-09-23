# Backup and recovery

Each TKeeper peer owns local state. Cluster quorum is not a backup: surviving peers may keep operations available, but they do not make loss or rollback of one peer's database harmless.

## Recovery assets

The recovery plan must account for:

| Asset | Why it is needed |
| --- | --- |
| Peer database | encrypted key shares, generations, authorities, peer identity, integrity state, and platform side state |
| Runtime configuration | peer id, cluster topology, TLS, auth, selected features, platforms, and seal provider |
| Seal dependency | Shamir shares, HSM key, or cloud KMS key and its authorization path |
| TLS and trust material | public/internal API identity and peer connectivity |
| Audit integrity public keys | verification of retained audit events across integrity-key versions |
| Authority artifacts | exact digest-pinned policy and intent documents referenced by identities |

Back up each peer independently. Do not collect enough peer databases, unseal shares, or seal credentials into one backup account or location to defeat the threshold and seal boundaries.

## Snapshot rules

- Use a storage snapshot procedure validated for the peer database. Do not assume an arbitrary live filesystem copy is consistent.
- Encrypt backups and restrict restore access as tightly as live key-share storage.
- Record the TKeeper version, artifact digest, features, platforms, peer id, and snapshot time with each backup.
- Protect backups from silent rollback or replacement and retain the audit trail for backup and restore operations.
- Test access to external HSM or KMS keys; a database backup without its seal dependency may be intentionally unrecoverable.

## Restore validation

Restore a peer in an isolated environment before reconnecting it to the cluster.

1. Use the expected TKeeper artifact and configuration for that peer id.
2. Restore the database and required TLS/trust material.
3. Confirm the configured seal provider can unseal the restored state.
4. Check node status, inventory integrity, public keys, active generations, authorities, and platform side state.
5. Compare the restored generation state with healthy peers and the audit history.
6. Rejoin only after the state difference is understood.

An older backup may represent a generation that the cluster has already rotated, refreshed, destroyed, or repaired. Do not run consistency fix as an automatic restore step; use it only when the operator can establish which quorum state is safe.

## Share recovery mode

Share recovery is an explicit build capability. Select `recovery` and the platforms used by the
key histories that need repair. Gradle adds the corresponding platform recovery modules.

ECC recovery artifact:

```bash
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc
```

ML-DSA recovery artifact:

```bash
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=pqc
```

Artifact for both platforms:

```bash
./gradlew :build -Pkeeper.features=recovery -Pkeeper.platforms=ecc,pqc
```

The `all` feature selector does not include recovery. Build recovery as a separate maintenance
artifact and run that artifact on every helper and target only for the repair window.

### Preconditions

- The configured quorum satisfies `1 < threshold < total`.
- The operator has selected a sorted list of exactly `threshold` healthy helper peer ids.
- The target peer id is not in the helper list.
- The helpers agree on the complete key history and have no pending state for the key.
- Public TLS, internal mTLS with client authentication, outbound client mTLS, and a distinct
  `tls-spki-sha256` pin for every peer are configured.
- Initialization, database identity, integrity, TLS, and seal state are intact on the target.

Legacy unversioned generation zero is outside the recovery boundary.

### Run recovery

1. Stop normal traffic to the participating keepers.
2. Deploy the recovery-capable artifact to the target and selected helpers.
3. Restart each participant with recovery mode enabled:

   ```bash
   java -Dkeeper.recovery=true -jar build/libs/tkeeper-2.4.1.jar
   ```

4. Unseal the keepers if required and confirm health and status.
5. Call the recovery endpoint on the damaged keeper with a principal that has
   `tkeeper.recover`:

   ```bash
   curl --fail-with-body \
     --cacert public-ca.crt \
     -H 'X-JWT-TOKEN: <raw-jwt>' \
     -H 'Content-Type: application/json' \
     -d '{"keyId":"signing-key","helperIds":[1,2,3]}' \
     https://keeper-4:8080/v1/keeper/recovery/recover
   ```

6. Compare the returned algorithm, current generation, recovered generations, and helpers with
   the expected state. Read every generation's public key while recovery mode is still enabled.
7. Repeat for each damaged logical key.
8. Rebuild the normal production artifact with the deployment's regular feature and platform
   selectors, without `recovery`:

   ```bash
   ./gradlew :build -Pkeeper.features=<production-features> -Pkeeper.platforms=<production-platforms>
   ```

9. Replace the maintenance artifact on every participant and restart with
   `keeper.recovery=false`. Do not return the recovery-capable artifact to normal service.
10. Verify historical inventory, current generation, public keys, owner and expiration indexes,
   destroyed generations, and a normal signing operation.

The endpoint requires the operator-provided helper list. It does not discover or replace helpers.
If a selected helper is missing or has conflicting key state, the request fails before target writes.

### Rebuilt state

The target first obtains an identical manifest from every selected helper. Only after validation
does it replace all local state for that logical key in one database transaction. The rebuild covers:

- active key material for every non-destroyed generation;
- signed versioned metadata, policies, authorities, owner, and expiration data;
- the current-generation pointer and historical inventory;
- destroy markers;
- ECC commitments or ML-DSA public keys and recovery commitments; and
- derived owner and expiration indexes.

Target-local pending, missing, stale, or conflicting records for the key are discarded. A failure
inside the replacement transaction rolls back the reset and install together. Prefix-adjacent key
ids are not part of the reset.

If the helpers mark a generation destroyed, recovery restores its metadata and destroy marker but
does not install secret material. Recovery can rebuild a peer with no local records for the logical
key, provided the target database identity and other node-scoped state still exist.

### Platform behavior

ECC recovery uses exactly `threshold` remote helpers. Helpers exchange fresh pairwise masks and
return masked Lagrange contributions. The target validates each reconstructed share against the
generation's polynomial commitments. It works for any configured quorum with `1 < threshold < total`;
`threshold = total` cannot recover a missing share because only `total - 1` shares survive.

ML-DSA helpers return only replicated RSS components that belong to the target. The target validates
each component against the signed per-subset commitments stored during DKG or dealer split. Legacy
ML-DSA generations without these commitments remain usable but return `RECOVERY_NOT_POSSIBLE`.
ML-DSA parameter changes between generations are supported. A history that crosses between ECC and
PQC returns `RECOVERY_NOT_POSSIBLE` without installing partial state.

Recovery is limited to 64 historical generations per logical key.

### Recovery mode boundary

Recovery mode blocks normal key operations. The public API allows health, status, seal, unseal,
public-key reads, and recovery routes. The internal API allows health, integrity-public-key discovery,
and the selected platform's recovery routes. Helpers reject recovery calls while running in normal
mode. Startup fails if the artifact lacks the recovery feature or the required TLS and peer-pin
configuration.

Recovery repairs keeper state. It does not determine whether the lost or modified share was exposed.
Rotate or reshare after recovery when required by the incident response decision.

Disabling the runtime flag is not the final deployment state. The normal artifact must exclude the
recovery base module and both platform recovery implementations.

### ECC mask boundary

The mask construction hides an honest helper contribution from the target colluding with up to
`t - 2` helpers. A malicious helper can cause the final commitment check to fail; this version does
not include a zero-knowledge proof that attributes that denial of service. Secret scalar arithmetic
uses random quotient blinding, pair masks, and one secure modular reduction, but the bigint backend
is not a formally verified fixed-width constant-time field implementation. Co-resident timing and
microarchitectural attackers remain outside the protocol's threat model.

Within one recovery session each helper caches its contribution, so retries return the same value
and do not create a second equation. Every new session uses independent CSPRNG pair masks. Reusing a
pair mask in a session with a different helper set (and therefore a different Lagrange coefficient)
would reveal that helper's share; the signed transcript binds the session id, target, canonical
helper set, algorithm, generation, commitments, metadata, and expiry, and rejects such reuse.

The complete graph contains `t(t - 1) / 2` mask deliveries. The implementation bounds setup to 64
concurrent requests; validate recovery latency at the deployment's largest supported `t` before
relying on the default session lifetime.

## Recovery objectives

Define and test separately:

- loss of one peer while quorum remains available
- loss of a peer database with its seal dependency intact
- seal-provider outage with peer data intact
- rollback to an older peer snapshot
- loss of an audit sink or integrity-key history
- regional failure affecting multiple peers or recovery operators

If the recovery design cannot restore enough independent shares and seal dependencies, document key loss as the expected outcome. If recovery storage contains enough material to use the identity unilaterally, document that storage as part of the key-custody boundary.
