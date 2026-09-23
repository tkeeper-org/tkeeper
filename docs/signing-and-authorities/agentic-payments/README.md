# Agentic Payment Authorities

AP2 and Mastercard Verifiable Intent (MC VI) sign ES256 JWS inputs with a P-256 key. Both use Keeper's authority, approval, and signing pipeline.

| Protocol | Authority type | Build selector | Guide |
| --- | --- | --- | --- |
| AP2 | `ap2.mandate` | `ap2` | [AP2](ap2.md) |
| MC VI | `mcintent.mandate` | `mc-vi` | [MC Intent](mcintent.md) |

Build both with `-Pkeeper.features=agentic-payments -Pkeeper.platforms=ecc`, or select one feature from the table. Each guide contains a complete authority YAML and a compose request.

`signingInput` is the exact unpadded base64url JWS header and payload joined by `.`. Supply every disclosure referenced by the mandate. Keeper checks their commitments, evaluates every action against the authority policy, and signs the unchanged input. `/v2/keeper/sign` returns the raw signature; [Composer](../composer.md) returns a serialized `PaymentCredential` layer.

The caller supplies issuer, audience, nonce, time, and parent-binding claims. The recipient verifies the credential chain, merchant identity, audience, expiry, and replay rules. Keeper checks the outgoing layer's content commitments; parent credentials and merchant signatures need verification by the recipient. See the [module contract](../../../features/agentic-payments/README.md) for supported profiles and disclosure rules.
