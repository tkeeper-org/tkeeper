# EVM Authorities

The `evm.transaction` authority checks an unsigned transaction and its decoded effects before signing. Build with `evm` and `ecc`:

```bash
./gradlew shadowJar -Pkeeper.features=evm -Pkeeper.platforms=ecc
```

Policy can constrain native transfers, token transfers, spender approvals, and configured contract calls. Signing requires an allow decision and any approvals selected by policy.

## Enforcement boundary

The authority should pin the intended chain and describe every contract call the policy is allowed to approve. Native intent handling fails closed when TKeeper cannot map a call to a known effect.

TKeeper signs the approved transaction. The surrounding wallet or custody service remains responsible for transaction construction, nonce and gas strategy, broadcast, replacement, receipt tracking, and settlement state. It must broadcast exactly the transaction that policy approved.

External risk verdicts must be bound to the same transaction intent; a verdict for an address or amount outside the signed transaction is only advisory metadata.

## Compose a signed transaction

Pass the serialized unsigned transaction bytes as Base64 in `UnsignedEvmTransaction.message64` to `/v2/keeper/compose`. The EVM composer applies the Keeper signature to that transaction and returns `SignedEvmTransaction` with `rawTransaction` (hex for `eth_sendRawTransaction`), `transactionHash`, `generation`, and `imposters`. The regular sign endpoint still returns the signature alone.

```java
var command = Command.of(authorityId, new UnsignedEvmTransaction(message64));
var signed = client.signature().compose(Sign.of(keyId, command), SignedEvmTransaction.class);
var rawTransaction = signed.rawTransaction();
```

The result covers legacy and typed transactions 1–4. For type 3 blob transactions, `rawTransaction` contains the signed transaction envelope; broadcasting also requires the blob sidecar.

## Authority config

```yaml
type: evm.transaction
config:
  chainId: 1
  contracts:
    - standard: erc20
      address: "0x1111111111111111111111111111111111111111"
```

Custom contract calls declare their ABI signature, argument names, and effects:

```yaml
config:
  chainId: 1
  contracts:
    - name: vault
      address: "0x4444444444444444444444444444444444444444"
      functions:
        - signature: "withdraw(address,uint256)"
          arguments: [to, amount]
          effects:
            - type: vault.withdraw
              fields:
                vault: "$transaction.to"
                to: "$to"
                amount: "$amount"
```

`chainId` comes from trusted config. Typed transactions must match it; legacy unsigned transactions carry no chain id.

Built-in effects:

- `native.transfer`
- `erc20.transfer`
- `erc20.approval`
- `erc20.transferFrom`

Strict CEL roots:

- `type`, `chainId`, `nonce`
- `gasPrice`, `gasLimit`, `maxPriorityFeePerGas`, `maxFeePerGas`
- `to`, `value`, `data`, `selector`
- `transaction`, `call`, `effects`

Intent validation rejects unsigned-data violations, chain mismatch, unlisted contracts or functions, calldata decoding failures, and effects that the trusted config cannot describe.

## Authority example: treasury USDC transfer

This authority allows mainnet USDC transfers to one operating wallet: up to 100 USDC without approval, or above 100 and up to 1,000 USDC with one treasury approval. Other recipients, effects, contracts, chains, and larger amounts are denied.

```yaml
schemaVersion: verdict.authority/v1
id: evm-usdc-operating-transfer
type: evm.transaction
version: 1.0.0

metadata:
  title: Treasury USDC transfer to operating wallet

config:
  chainId: 1
  contracts:
    - standard: erc20
      address: "0x1111111111111111111111111111111111111111"

policy:
  id: evm-usdc-operating-transfer
  fallback: DENY
  approvers:
    treasury-reviewer:
      algorithm: ED25519
      publicKey64: "BASE64_ENCODED_ED25519_PUBLIC_KEY"
  variables:
    recipientAddress: "0x2222222222222222222222222222222222222222"
    automaticLimit: "100000000"
    reviewedLimit: "1000000000"
  allow:
    - id: automatic-transfer
      where:
        - "chainId == 1"
        - "effect.onlyTypes(effects, ['erc20.transfer'])"
        - "effect.one(effects, 'erc20.transfer')"
        - "effect.any(effects, 'erc20.transfer', {'to': recipientAddress})"
        - "bigint.lte(effect.amount(effects, 'erc20.transfer'), automaticLimit)"
    - id: reviewed-transfer
      where:
        - "chainId == 1"
        - "effect.onlyTypes(effects, ['erc20.transfer'])"
        - "effect.one(effects, 'erc20.transfer')"
        - "effect.any(effects, 'erc20.transfer', {'to': recipientAddress})"
        - "bigint.gt(effect.amount(effects, 'erc20.transfer'), automaticLimit)"
        - "bigint.lte(effect.amount(effects, 'erc20.transfer'), reviewedLimit)"
      approvals:
        threshold: 1
        approvers: [treasury-reviewer]
  deny: []
```

Replace the token contract, recipient, limits, and `publicKey64` with trusted production values. A transfer to another wallet should use another authority id and document.

See [Authorities](../signing-and-authorities/authorities.md) for the document and policy schema, [CEL Functions](../signing-and-authorities/cel-functions.md) for policy helpers, and [Composer](../signing-and-authorities/composer.md) for response behavior.
