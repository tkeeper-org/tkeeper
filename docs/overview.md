# Overview

TKeeper controls machine authority.

A machine becomes risky when it can cause a real effect: move funds, approve a spender, issue a certificate, decrypt data, rotate a key, import key material, or delegate power to another system.

Classic access control answers who can reach an API. TKeeper answers what this call is allowed to cause.

This distinction matters. `can_sign` is too broad for a system that signs payments, certificates, transactions, approvals, or agent actions. The same authenticated caller can ask for harmless data or for an irreversible effect. Policy has to inspect the effect and the verb.

## Why It Exists

TKeeper is built around the failure class that MAF calls machine authority failure: a machine was allowed to create an outcome outside its intended authority.

These failures are rarely about one missing permission check. They happen when scope is too broad, approval survives its context, policy sees only a surface action, enforcement sits away from the primitive, or individually valid steps combine into an unsafe result.

TKeeper narrows that boundary at the moment the effect is produced.

## Authority Path

TKeeper puts policy on the authority path.

The component that holds authority verifies the request before it produces the effect. For TKeeper, that component is the key system itself. A sign, decrypt, rotate, reshare, destroy, or trusted-dealer import has to pass the configured controls before local key material or peer shares participate.

Those controls can include:

- authentication and permission checks
- key lifecycle state
- key time policy
- four eye approval
- authority policy
- audit logging
- request integrity

If a check fails, the crypto session does not start.

## Authorities

Authorities describe what kind of consequence a key may authorize.

A key can use `arbitrary` authority for raw signing. That mode is intentionally low context. It is useful for compatibility and tests, but it gives policy little to inspect.

Typed authorities carry more meaning. They bind a key to policy that understands the command being requested. An EVM authority can reason about chain id, calldata, token approval, recipient, spender, or value movement. Other authorities can model other domains.

The core idea is simple: turn a request into something policy can evaluate before key material participates.

## Quorum Modes

TKeeper can run in two quorum modes.

### Mono
It is `1-of-1` setup. One Keeper owns the full key material locally. It still enforces authentication, permissions, authorities, four eye control, time policy, audit logging, and request integrity. It does not give threshold custody or Byzantine tolerance. Use it when a deployment needs the TKeeper authority layer first, or when a system starts small and will be promoted later.

A mono Keeper can be promoted into a threshold quorum. Promotion splits the active keys into shares, imports them into the new peers, destroys the old mono key material, rewrites init data, and requires a restart.

### Multi-Party (Threshold)
It is `t-of-n` setup. One logical private key is split across peers.

No peer gets the full private key (not even on keygen). Operations need a quorum. The public API talks to one coordinator peer, while the coordinator talks to the other peers over the internal API. Coordinator can be any of available nodes

Threshold crypto handles the key custody problem. TKeeper layers authority controls around it so a quorum cannot be treated as a blank check.

The system also treats peer behavior as part of the security boundary. If a peer lies during a protocol, the protocol reports the peer where it can. If one peer is broken and enough honest peers remain, the operation can still complete.

It is ideal mode for **crypto** operations, if you work in high-risk environment or want to split risks between organizations.
## Operational Record

TKeeper keeps signed audit events and asset inventory because authority has a lifecycle.

Keys are created, rotated, reshared, imported, sealed, unsealed, used, and destroyed. Policies change. Approvals expire. Authorities are attached to keys and need to be visible later.

Asset Inventory shows what exists and which authorities are attached. Audit logs show what happened. Together they make the authority surface reviewable after the system has been running for a while.

## Where It Fits

TKeeper is built for systems where machine actions have consequences:

- wallet and transaction signing
- certificate or credential issuance
- agent and workflow execution
- internal automation with privileged effects
- encrypted data access
- single-node authority enforcement that can later move to threshold custody
- threshold key lifecycle management

Protecting the private key is only part of the job. TKeeper also prevents a machine from using that key outside the authority it was given.
