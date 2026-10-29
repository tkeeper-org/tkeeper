import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sdk = await import(process.argv[2] ?? '@stellar/stellar-sdk');
const { Account, Asset, Claimant, Keypair, Memo, Operation: op, Transaction, TransactionBuilder, xdr } = sdk;
const network = 'Standalone Network ; February 2017';
const alice = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(1));
const bob = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(2));
const issuer = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(3));
const a = alice.publicKey();
const b = bob.publicKey();
const usd = new Asset('USD', issuer.publicKey());
const native = Asset.native();
const pool = '04'.repeat(32);
const balanceId = '00000000' + '05'.repeat(32);
const contract = sdk.StrKey.encodeContract(new Uint8Array(32).fill(6));
const vectors = [];
const maxU64 = (1n << 64n) - 1n;
const maxI64 = (1n << 63n) - 1n;
const addresses = [alice, bob, issuer].flatMap(key => [0n, 1n, 0xffffffffn, maxI64, 1n << 63n, maxU64].map(id => {
    const muxed = sdk.encodeMuxedAccount(key.publicKey(), id.toString());
    return { seed: Buffer.from(key.rawSecretKey()).toString('hex'), publicKey: Buffer.from(key.rawPublicKey()).toString('hex'),
        account: key.publicKey(), id: id.toString(), muxed: sdk.encodeMuxedAccountToAddress(muxed), xdr: muxed.toXdr('base64') };
}));

function build(operations, memo = Memo.text('invoice-42')) {
    const builder = new TransactionBuilder(new Account(a, '9007199254740993'), { fee: '1000', networkPassphrase: network });
    operations.forEach(operation => builder.addOperation(operation));
    return builder.addMemo(memo).setTimebounds(1700000000, 1900000000).build();
}

function capture(name, transaction) {
    const envelope = transaction.toEnvelope();
    const inner = envelope.type === 'envelopeTypeTxFeeBump' ? transaction.innerTransaction : transaction;
    const tx = inner.toEnvelope().type === 'envelopeTypeTxV0' ? inner.toEnvelope().v0.tx : inner.toEnvelope().v1.tx;
    vectors.push({ name, envelope: transaction.toXDR(), hash: Buffer.from(transaction.hash()).toString('hex'),
        source: inner.source, feeSource: transaction.feeSource ?? inner.source, sequence: inner.sequence,
        fee: transaction.fee, outerSignatures: transaction.signatures.length,
        operationTypes: tx.operations.map(operation => operation.toXdrObject().body.type),
        operations: tx.operations.map(operation => operation.toXdr('base64')),
        memo: tx.memo.toXdr('base64'), innerHash: envelope.type === 'envelopeTypeTxFeeBump' ? Buffer.from(inner.hash()).toString('hex') : null });
}

const operations = [
    ['create-account', op.createAccount({ destination: b, startingBalance: '2' })],
    ['payment', op.payment({ destination: b, asset: native, amount: '1.2345678', source: b })],
    ['strict-receive', op.pathPaymentStrictReceive({ sendAsset: native, sendMax: '5', destination: b, destAsset: usd, destAmount: '1', path: [] })],
    ['sell-offer', op.manageSellOffer({ selling: native, buying: usd, amount: '1', price: '2', offerId: '9223372036854775807' })],
    ['passive-offer', op.createPassiveSellOffer({ selling: native, buying: usd, amount: '1', price: '2' })],
    ['set-options', op.setOptions({ masterWeight: 0, lowThreshold: 1, medThreshold: 2, highThreshold: 3, homeDomain: 'example.org', signer: { ed25519PublicKey: b, weight: 2 } })],
    ['change-trust', op.changeTrust({ asset: usd, limit: '922337203685.4775807' })],
    ['allow-trust', op.allowTrust({ trustor: b, assetCode: 'USD', authorize: true })],
    ['account-merge', op.accountMerge({ destination: b })],
    ['inflation', op.inflation()],
    ['manage-data', op.manageData({ name: 'config.memo_required', value: '1' })],
    ['bump-sequence', op.bumpSequence({ bumpTo: '9223372036854775807' })],
    ['buy-offer', op.manageBuyOffer({ selling: native, buying: usd, buyAmount: '1', price: '2' })],
    ['strict-send', op.pathPaymentStrictSend({ sendAsset: native, sendAmount: '5', destination: b, destAsset: usd, destMin: '1', path: [] })],
    ['create-claimable', op.createClaimableBalance({ asset: usd, amount: '1', claimants: [new Claimant(b, Claimant.predicateUnconditional())] })],
    ['claim-balance', op.claimClaimableBalance({ balanceId })],
    ['begin-sponsoring', op.beginSponsoringFutureReserves({ sponsoredId: b })],
    ['end-sponsoring', op.endSponsoringFutureReserves({ source: b })],
    ['revoke-sponsorship', op.revokeAccountSponsorship({ account: b })],
    ['clawback', op.clawback({ asset: usd, from: b, amount: '1' })],
    ['clawback-claimable', op.clawbackClaimableBalance({ balanceId })],
    ['trustline-flags', op.setTrustLineFlags({ trustor: b, asset: usd, flags: { authorized: true, clawbackEnabled: false } })],
    ['pool-deposit', op.liquidityPoolDeposit({ liquidityPoolId: pool, maxAmountA: '1', maxAmountB: '2', minPrice: '1', maxPrice: '2' })],
    ['pool-withdraw', op.liquidityPoolWithdraw({ liquidityPoolId: pool, amount: '1', minAmountA: '0.1', minAmountB: '0.2' })],
    ['invoke-contract', op.invokeContractFunction({ contract, function: 'transfer', args: [sdk.nativeToScVal(123n, { type: 'i128' })] })],
    ['extend-ttl', op.extendFootprintTtl({ extendTo: 100 })],
    ['restore-footprint', op.restoreFootprint({})]
];

for (const [name, operation] of operations) {
    const soroban = operation.toXdrObject().body.type >= 24;
    let transaction = build([operation], soroban ? Memo.none() : Memo.text('invoice-42'));
    if (operation.toXdrObject().body.type >= 24) {
        const wire = transaction.toEnvelope().toXdrObject();
        wire.v1.tx.memo = { type: 0 };
        wire.v1.tx.ext = { v: 1, sorobanData: { ext: { v: 1, resourceExt: { archivedSorobanEntries: [0] } },
            resources: { footprint: { readOnly: [{ type: 0, account: { accountId: { type: 0, ed25519: alice.rawPublicKey() } } }],
                readWrite: [{ type: 7, contractCode: { hash: new Uint8Array(32).fill(9) } }] },
                instructions: 123456, diskReadBytes: 1024, writeBytes: 2048 }, resourceFee: 999n } };
        if (name === 'invoke-contract') {
            const host = wire.v1.tx.operations[0].body.invokeHostFunctionOp;
            const fn = { type: 0, contractFn: host.hostFunction.invokeContract };
            const invocation = { function: fn, subInvocations: [{ function: fn, subInvocations: [] }] };
            const credentials = { address: new sdk.Address(a).toScAddress().toXdrObject(), nonce: 9223372036854775807n,
                signatureExpirationLedger: 4294967295, signature: { type: 1 } };
            const delegate = { address: new sdk.Address(b).toScAddress().toXdrObject(), signature: { type: 1 }, nestedDelegates: [] };
            host.auth = [ { type: 0 }, { type: 1, address: credentials }, { type: 2, addressV2: credentials },
                { type: 3, addressWithDelegates: { addressCredentials: credentials, delegates: [delegate] } } ]
                .map(credentials => ({ credentials, rootInvocation: invocation }));
        }
        transaction = new Transaction(xdr.TransactionEnvelope.fromXdrObject(wire), network);
    }
    capture(name, transaction);
}

const basic = build([op.payment({ destination: b, asset: native, amount: '2' })]);
const wire = basic.toEnvelope().toXdrObject();
wire.v1.tx.cond = { type: 2, v2: { timeBounds: { minTime: 1700000000n, maxTime: 1900000000n },
    ledgerBounds: { minLedger: 123, maxLedger: 456 }, minSeqNum: 42n, minSeqAge: 18446744073709551615n,
    minSeqLedgerGap: 5, extraSigners: [{ type: 0, ed25519: bob.rawPublicKey() }] } };
capture('preconditions-v2', new Transaction(xdr.TransactionEnvelope.fromXdrObject(wire), network));

const classic = basic.toEnvelope().toXdrObject().v1.tx;
const v0 = xdr.TransactionEnvelope.fromXdrObject({ type: 0, v0: { tx: {
    sourceAccountEd25519: alice.rawPublicKey(), fee: classic.fee, seqNum: classic.seqNum,
    timeBounds: classic.cond.timeBounds, memo: classic.memo, operations: classic.operations, ext: { v: 0 }
}, signatures: [] } });
capture('v0-unsigned', new Transaction(v0, network));
const legacySigned = new Transaction(v0, network);
legacySigned.sign(alice);
capture('v0-signed', legacySigned);

capture('memo-none', build([operations[0][1]], Memo.none()));
capture('memo-id-max', build([operations[0][1]], Memo.id('18446744073709551615')));
capture('memo-hash', build([operations[0][1]], Memo.hash(new Uint8Array(32).fill(7))));
capture('memo-return', build([operations[0][1]], Memo.return(new Uint8Array(32).fill(8))));
capture('hundred-operations', build(Array.from({ length: 100 }, () => operations[1][1])));

basic.sign(alice);
capture('v1-signed', basic);
const bump = TransactionBuilder.buildFeeBumpTransaction(bob, '1000', basic, network);
capture('fee-bump-unsigned-outer', bump);
bump.sign(bob);
capture('fee-bump-signed', bump);

function captureWire(name, update, original = basic) {
    const wire = original.toEnvelope().toXdrObject();
    wire.v1.signatures = [];
    update(wire.v1.tx, wire);
    capture(name, new Transaction(xdr.TransactionEnvelope.fromXdrObject(wire), network));
}

captureWire('muxed-sources-and-destination', tx => {
    tx.sourceAccount = sdk.encodeMuxedAccount(a, maxU64.toString()).toXdrObject();
    const operation = tx.operations[0];
    operation.sourceAccount = sdk.encodeMuxedAccount(b, '0').toXdrObject();
    operation.body.paymentOp.destination = sdk.encodeMuxedAccount(b, '1').toXdrObject();
});
for (const sequence of [-maxI64 - 1n, maxI64]) {
    captureWire(`numeric-boundary-${sequence < 0 ? 'min' : 'max'}`, tx => {
        tx.fee = 0xffffffff;
        tx.seqNum = sequence;
        tx.operations[0].body.paymentOp.amount = sequence;
        tx.cond = { type: 0 };
    });
}

const signatureLimit = build([operations[1][1]]);
for (let value = 1; value <= 20; value++) signatureLimit.sign(Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(value)));
capture('twenty-signatures', signatureLimit);
for (const length of [0, 3, 64]) {
    const hashX = build([operations[1][1]]);
    hashX.signHashX(new Uint8Array(length).fill(42));
    capture(`hash-x-preimage-${length}`, hashX);
}
const muxedBump = bump.toEnvelope().toXdrObject();
muxedBump.feeBump.tx.fee = maxI64;
muxedBump.feeBump.tx.feeSource = sdk.encodeMuxedAccount(b, maxU64.toString()).toXdrObject();
muxedBump.feeBump.signatures = [];
capture('fee-bump-muxed-max-fee', new sdk.FeeBumpTransaction(xdr.TransactionEnvelope.fromXdrObject(muxedBump), network));

const signerKeys = [
    { type: 0, ed25519: bob.rawPublicKey() },
    { type: 1, preAuthTx: new Uint8Array(32).fill(1) },
    { type: 2, hashX: new Uint8Array(32).fill(2) },
    { type: 3, ed25519SignedPayload: { ed25519: bob.rawPublicKey(), payload: new Uint8Array(64).fill(3) } }
];
captureWire('all-signer-keys', tx => {
    tx.operations = signerKeys.map(key => ({ sourceAccount: null, body: { type: 5,
        setOptionsOp: { ...operations[5][1].toXdrObject().body.setOptionsOp, signer: { key, weight: 255 } } } }));
});
captureWire('revoke-signer-sponsorship', tx => {
    tx.operations = signerKeys.map(signerKey => ({ sourceAccount: null, body: { type: 18,
        revokeSponsorshipOp: { type: 1, signer: { accountId: { type: 0, ed25519: alice.rawPublicKey() }, signerKey } } } }));
});
capture('claim-predicates', build([op.createClaimableBalance({ asset: native, amount: '1', claimants: [new Claimant(b,
    Claimant.predicateAnd(Claimant.predicateBeforeAbsoluteTime('1900000000'), Claimant.predicateOr(
        Claimant.predicateNot(Claimant.predicateBeforeRelativeTime('100')), Claimant.predicateUnconditional())))] })]));
capture('manage-data-delete', build([op.manageData({ name: 'x'.repeat(64), value: null })]));
capture('manage-data-max', build([op.manageData({ name: 'x'.repeat(64), value: new Uint8Array(64).fill(255) })]));
capture('credit12-and-full-path', build([op.pathPaymentStrictSend({ sendAsset: native, sendAmount: '1', destination: b,
    destAsset: new Asset('LONGASSET123', issuer.publicKey()), destMin: '0.1', path: [usd, native, usd, native, usd] })]));
capture('trust-pool-share', build([op.changeTrust({ asset: new sdk.LiquidityPoolAsset(native, usd, 30), limit: '1' })]));

const addressValues = [
    { type: 0, accountId: { type: 0, ed25519: alice.rawPublicKey() } },
    { type: 1, contractId: new Uint8Array(32).fill(6) },
    { type: 2, muxedAccount: { id: maxU64, ed25519: alice.rawPublicKey() } },
    { type: 3, claimableBalanceId: { type: 0, v0: new Uint8Array(32).fill(5) } },
    { type: 4, liquidityPoolId: new Uint8Array(32).fill(4) }
];
const values = [
    { type: 0, b: true }, { type: 1 }, { type: 2, error: { type: 0, contractCode: 0xffffffff } },
    { type: 3, u32: 0xffffffff }, { type: 4, i32: -2147483648 },
    { type: 5, u64: maxU64 }, { type: 6, i64: -maxI64 - 1n },
    { type: 7, timepoint: maxU64 }, { type: 8, duration: maxU64 },
    { type: 9, u128: { hi: maxU64, lo: maxU64 } }, { type: 10, i128: { hi: -maxI64 - 1n, lo: 0n } },
    { type: 11, u256: { hiHi: maxU64, hiLo: maxU64, loHi: maxU64, loLo: maxU64 } },
    { type: 12, i256: { hiHi: -maxI64 - 1n, hiLo: 0n, loHi: 0n, loLo: 0n } },
    { type: 13, bytes: new Uint8Array([0, 255, 1]) }, { type: 14, str: new TextEncoder().encode('Привет 🌍') },
    { type: 15, sym: 'x'.repeat(32) }, { type: 16, vec: [{ type: 1 }] },
    { type: 17, map: [{ key: { type: 3, u32: 7 }, val: { type: 0, b: false } }] },
    { type: 18, address: addressValues[0] },
    { type: 19, instance: { executable: { type: 0, wasmHash: new Uint8Array(32).fill(9) }, storage: [] } },
    { type: 20 }, { type: 21, nonceKey: { nonce: -maxI64 - 1n } },
    { type: 22, executableTag: new TextEncoder().encode('v1') },
    { type: 16, vec: null }, { type: 17, map: null },
    ...addressValues.slice(1).map(address => ({ type: 18, address })),
    ...Array.from({ length: 9 }, (_, i) => ({ type: 2, error: { type: i + 1, code: 9 } }))
];
const invoke = new Transaction(vectorEnvelope('invoke-contract'), network);
function vectorEnvelope(name) {
    return xdr.TransactionEnvelope.fromXdr(vectors.find(vector => vector.name === name).envelope, 'base64');
}
captureWire('all-soroban-values', tx => {
    tx.operations[0].body.invokeHostFunctionOp.hostFunction.invokeContract.args = values;
}, invoke);
const preimage = { type: 0, fromAddress: { address: addressValues[0], salt: new Uint8Array(32).fill(10) } };
const executables = [ { type: 0, wasmHash: new Uint8Array(32).fill(9) }, { type: 1 },
    { type: 2, externalRef: { executableOwner: addressValues[0], tag: new TextEncoder().encode('v1') } } ];
const creation = { contractIdPreimage: preimage, executable: executables[0] };
const hostFunctions = [
    { type: 1, createContract: creation },
    { type: 2, wasm: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]) },
    { type: 3, createContractV2: { ...creation, constructorArgs: values } }
];
for (const hostFunction of hostFunctions) {
    captureWire(`host-function-${hostFunction.type}`, tx => {
        tx.operations[0].body.invokeHostFunctionOp = { hostFunction, auth: [] };
    }, invoke);
}
captureWire('contract-preimages-and-executables', tx => {
    tx.operations = executables.map(executable => ({ sourceAccount: null, body: { type: 24, invokeHostFunctionOp: {
        hostFunction: { type: 1, createContract: { contractIdPreimage: { type: 1, fromAsset: { type: 0 } }, executable } }, auth: [] } } }));
}, invoke);
captureWire('authorization-creation-functions', tx => {
    const host = tx.operations[0].body.invokeHostFunctionOp;
    host.auth = [ { type: 1, createContractHostFn: creation },
        { type: 2, createContractV2HostFn: { ...creation, constructorArgs: values } } ]
        .map(fn => ({ credentials: { type: 0 }, rootInvocation: { function: fn, subInvocations: [] } }));
}, invoke);

const result = { sdk: '@stellar/stellar-sdk@17.4.0', network, aliceSeed: '01'.repeat(32),
    alicePublicKey: a, bobPublicKey: b, addresses, vectors };
const output = fileURLToPath(new URL('./stellar-sdk-17.4.0.json', import.meta.url));
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(`${vectors.length} vectors written to ${output}`);
