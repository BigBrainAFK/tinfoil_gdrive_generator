const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const aesjs = require('aes-js');

function ReverseEndian(input) {
    buff = Buffer.allocUnsafe(8);
    buff.writeBigUInt64LE(BigInt(input));
    return buff.readBigUInt64BE();
}

function wrapKey(key) {
    return crypto.publicEncrypt({
        key: fs.readFileSync('./public.key'),
        oaepHash: 'sha256',
        oaepLabel: Buffer.from('')
    }, key);
}

aesKey = crypto.randomBytes(16);

const file = fs.readFileSync(process.argv[2]);

const cipher = new aesjs.ModeOfOperation.ecb(aesKey);
let buf = zlib.deflateSync(file, {level: 9});
const sz = buf.length;
buf = Buffer.from(cipher.encrypt(Buffer.concat([buf, Buffer.from('00'.repeat(0x10 - (sz % 0x10)), 'hex')])));

console.log(aesKey.toString('hex'));

const streamWriter = fs.createWriteStream(process.argv[3]);

with (streamWriter) {
    write(Buffer.concat([Buffer.from('TINFOIL'), Buffer.from('FE', 'hex')]));
    write(wrapKey(aesKey));
    write(Buffer.from(ReverseEndian(sz).toString(16), 'hex'));
    write(buf);
    close();
}

console.log('fin');