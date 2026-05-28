# Choosing a Quorum Mode

TKeeper can run in two quorum modes:

- `mono`: one Keeper, `1-of-1`
- `threshold`: several Keepers, `t-of-n`

Threshold mode is the MPC mode. It is the safest default for production custody.

Mono exists because not every deployment starts as a full cluster. It gives teams a simple path to adopt TKeeper controls first, then promote into MPC when the system is ready.

## What MPC Gives You

MPC removes the single machine that can use the key alone.

In threshold mode, each peer holds one share. A sign or decrypt operation needs enough peers to participate. One compromised host should not be enough to produce a signature or decrypt data.

This matters for insider risk too. A single operator, VM, pod, or host with access to one peer does not get unilateral key authority.

Threshold mode also gives better failure evidence. When a peer lies during FROST, GG20, or threshold ECIES, TKeeper reports bad peers where the protocol can identify them. If enough honest peers remain, the operation can still complete.

What MPC helps with:

- one compromised Keeper host
- one leaked local database
- one malicious or careless operator
- partial infrastructure compromise
- Byzantine behavior from a minority of peers
- safer custody for keys that move money, issue credentials, or decrypt sensitive data

Each peer enforces TKeeper policy before it participates in an operation. If an attacker gets full control of one Keeper and changes its local policy state, that peer may be willing to approve or participate incorrectly, but it still only controls one share.

In threshold mode, a forged policy on one peer is not enough for bypass. The attacker must compromise policy enforcement on enough peers to reach the quorum threshold, or convince enough honest peers through valid authorized requests.

This means policy integrity becomes quorum-bound too
## What MPC Costs

Threshold mode is heavier.

You run more nodes. You monitor more nodes. You need internal networking, peer auth, health checks, coordinated deploys, and backup discipline for each peer.

Some operations are slower because peers have to talk. Some failures are more complex because an operation can be half-complete on one peer and not another. TKeeper has consistency repair for that, but the operational model is still more serious than one local process.

The cost is both CAPEX and OPEX:

- more machines or containers
- more networking and firewall rules
- more monitoring and alerting
- more deployment coordination
- more seal and unseal material to protect
- more incident response paths

That cost is usually worth it for real custody.

## When Mono Fits

Mono mode is simple.

One Keeper holds the full private key material locally. Requests still go through TKeeper controls: authentication, permissions, authorities, four eye control, time policy, audit logging, and request integrity.

Mono is useful for:

- development
- local integration tests
- small deployments that need policy before distributed custody
- bootstrap phases before the cluster is ready
- systems where the key is not valuable enough to justify MPC yet

Mono does not protect against compromise of the Keeper host. If that one node is owned, the key material is owned.

## Recommendation

Use threshold mode for production keys with real consequences.

That includes wallets, signing keys, certificate issuance, privileged automation, customer data decryption, and anything where one compromised machine should not get the final say.

Use mono when you need the simpler path first. Treat it as a stepping stone unless the risk profile is intentionally small.

TKeeper supports this path directly:

1. Start with mono: `threshold = 1`, `total = 1`.
2. Attach authorities and policies.
3. Run the system.
4. Add new peers.
5. Promote mono into threshold with `POST /v2/keeper/quorum/promote`.

Promotion splits active keys into shares, imports those shares into the new peers, destroys old mono key material, rewrites init data, and requires a restart.

The target peers must already be initialized and unsealed with the same `threshold` and `total`.

## Quick Choice

| Question                                                  | Use mono   | Use threshold |
|-----------------------------------------------------------|------------|---------------|
| Is one compromised host allowed to use the key?           | maybe      | no            |
| Do you need protection from insider risk?                 | no         | yes           |
| Is this a dev or bootstrap environment?                   | yes        | maybe         |
| Is the key tied to money, credentials, or sensitive data? | usually no | yes           |
| Can you operate several peers well?                       | not needed | required      |
| Do you want the strongest TKeeper custody model?          | no         | yes           |

The short version: mono is the easy door in. Threshold is the security posture to grow into.
