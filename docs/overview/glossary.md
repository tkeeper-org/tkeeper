# Glossary

## Authority

Rules attached to a key that define an accepted command type and its policy. Raw `arbitrary` authority accepts bytes without intent policy.

Examples: arbitrary bytes signing, typed commands, EVM transactions, Bitcoin transactions, X.509 certificate issuance.

## Authority path

The sequence from a request to its execution, including TKeeper's checks and the receiving system's signature verification.

## Command

The API object that describes what the caller wants to sign. For concrete authorities, TKeeper parses it into an intent before policy evaluation.

## Cryptographic proof

A signature or signed artifact that a receiving system can verify before executing an action.

## DKG

Distributed key generation. In threshold mode, peers create key shares without reconstructing a private key on one machine.

## Effect

A normalized consequence derived from an intent and exposed to policy, such as a token transfer, approval, certificate issuance, or typed internal action.

## Feature

A build option that adds endpoints, authority types, the UI, or seal providers.

Examples: `digital-assets`, `agentic-payments`, `authority-x509`, `ecies`, `ui`, `seal-aws`, `seal-gcloud`.

## Four-eye control

A control that requires independent approval before an operation can continue.

## Generation

A version of key material or key-share state for the same key id. Lifecycle operations can create new generations.

## Governed cryptographic identity

A key with attached authorities and policy that limit what it may sign. The receiving system verifies the signature and signed action before execution.

## Intent

Parsed command fields and effects exposed to authority policy.

## Mono

The quorum mode where one local node holds and uses key material. Mono still uses TKeeper policy, authority, audit, and lifecycle controls.

## Platform

A build-time module that provides cryptographic algorithms and protocol implementations.

Build selectors: `ecc`, `pqc`.

## Quorum

A set of enough peers to complete an operation. In a `t-of-n` configuration, at least `t` peers must participate.

## Refresh

A lifecycle operation that creates a new generation without changing the aggregate key. Threshold ECC replaces the peer shares. ML-DSA carries each peer's existing share and public key forward unchanged.

## Rotate

A lifecycle operation that creates new key material.

## Threshold

The quorum mode where key material is split across peers and an operation needs enough peer participation to complete.

## Trusted dealer

A source that holds an existing private key and imports it into TKeeper. Threshold import splits that key into peer shares; copies retained by the dealer remain usable.

## Verifier

The component that checks the expected key, signature, signed action, and freshness before accepting an operation.
