import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sdk = await import(process.argv[2] ?? '@stellar/stellar-sdk');
const fixture = JSON.parse(readFileSync(new URL('./stellar-sdk-17.4.0.json', import.meta.url)));
const upperSnake = name => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const field = name => name.replaceAll('_', '').toLowerCase();

function text(bytes) {
    return Array.from(bytes, byte => {
        switch (byte) {
            case 0: return '\\0';
            case 9: return '\\t';
            case 10: return '\\n';
            case 13: return '\\r';
            case 92: return '\\\\';
            default: return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '\\x' + byte.toString(16).padStart(2, '0');
        }
    }).join('');
}

function value(input) {
    if (typeof input === 'bigint') return JSON.rawJSON(input.toString());
    if (input == null || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(value);
    if (input instanceof Uint8Array) return Buffer.from(input).toString('hex');
    if (input.constructor.name === 'XdrString') return text(input.bytes);
    if (input.type?.startsWith('keyType') || input.type?.startsWith('publicKeyType')) return input.toJson();

    const wire = input.toXdrObject();
    if (typeof wire !== 'object' || wire == null || Array.isArray(wire) || wire instanceof Uint8Array) {
        return typeof input.name === 'string' ? upperSnake(input.name) : value(wire);
    }

    const result = {};
    for (const [key, raw] of Object.entries(wire)) {
        if (raw == null) continue;
        if (key === 'type' || key === 'v') {
            result.discriminant = key === 'v' ? raw : upperSnake(input.type);
        } else {
            const name = field(key);
            if (Object.hasOwn(result, name)) throw new Error(`Duplicate field ${name}`);
            result[name] = value(input[key] ?? raw);
        }
    }
    return result;
}

const vectors = fixture.vectors.filter(vector => vector.outerSignatures === 0 && BigInt(vector.sequence) > 0n).map(vector => {
    const transaction = sdk.TransactionBuilder.fromXDR(vector.envelope, fixture.network);
    const inner = transaction.innerTransaction ?? transaction;
    const envelope = inner.toEnvelope();
    let body = envelope.type === 'envelopeTypeTxV0' ? envelope.v0.tx : envelope.v1.tx;
    if (envelope.type === 'envelopeTypeTxV0') {
        const wire = body.toXdrObject();
        body = sdk.xdr.Transaction.fromXdrObject({ sourceAccount: { type: 0, ed25519: wire.sourceAccountEd25519 },
            fee: wire.fee, seqNum: wire.seqNum, cond: wire.timeBounds == null ? { type: 0 } : { type: 1, timeBounds: wire.timeBounds },
            memo: wire.memo, operations: wire.operations, ext: { v: 0 } });
    }
    const nested = transaction.innerTransaction ? { ...value(inner.toEnvelope().v1),
        hash: Buffer.from(inner.hash()).toString('hex'), fee: JSON.rawJSON(inner.fee), signaturecount: inner.signatures.length } : null;
    return { name: vector.name, body: value(body), inner: nested };
});

const output = fileURLToPath(new URL('./policy-values-17.4.0.json', import.meta.url));
writeFileSync(output, JSON.stringify({ sdk: fixture.sdk, vectors }, null, 2) + '\n');
console.log(`${vectors.length} policy values written to ${output}`);
