# Glossary

## Authority

The declared capability attached to a key identity. An authority defines what kind of action the identity can authorize and how TKeeper should understand and govern requests for that action.

Examples: arbitrary bytes signing, typed commands, EVM transactions, Bitcoin transactions, X.509 certificate issuance.

## Authority path

The path where a requested action becomes a real effect. TKeeper is meant to sit on this path, so the effect depends on the cryptographic proof TKeeper controls.

## Command

The API object that describes what the caller wants to sign or authorize. A command is materialized into an intent before policy and signing.

## Cryptographic proof

The output another system can verify before executing an effect. Usually this is a signature or certificate. Some optional features expose other governed cryptographic results.

## DKG

Distributed key generation. In threshold mode, peers create key shares without reconstructing a private key on one machine.

## Effect

A normalized consequence derived from an intent and exposed to policy, such as a token transfer, approval, certificate issuance, or typed internal action.

## Feature

A build-time module that adds product functionality, endpoints, authority types, UI, or providers.

Examples: `digital-assets`, `agentic-payments`, `authority-x509`, `ecies`, `ui`, `seal-aws`, `seal-gcloud`.

## Four-eye control

A control that requires independent approval before an operation can continue.

## Generation

A version of key material or key-share state for the same key id. Lifecycle operations can create new generations.

## Governed cryptographic identity

A key identity whose allowed actions are declared through authorities, governed by policy, and bound to cryptographic proof that downstream systems can verify before execution.

## Intent

The exact action being requested after TKeeper has parsed and normalized command data.

## Mono

The quorum mode where one local node holds and uses key material. Mono still uses TKeeper policy, authority, audit, and lifecycle controls.

## Platform

A build-time module that provides cryptographic algorithms and protocol implementations.

Examples: `platform-ecc`, `platform-pqc`.

## Quorum

The number of peers required to complete a threshold operation.

## Refresh

A lifecycle operation that creates a new generation without changing the aggregate key. Threshold ECC replaces the peer shares. ML-DSA carries each peer's existing share and public key forward unchanged.

## Rotate

A lifecycle operation that creates new key material.

## Threshold

The quorum mode where key material is split across peers and an operation needs enough peer participation to complete.

## Trusted dealer

An import model where a trusted source splits or provides key material to peers. It is useful for migration and external key onboarding, but the import path depends on trusting the dealer and imported material.

## Verifier

The downstream component that accepts a TKeeper proof and decides whether to execute the corresponding effect. It must validate the expected identity and exact intent, not only the signature equation.
