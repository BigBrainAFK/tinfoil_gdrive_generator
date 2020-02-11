const rsa = require('node-rsa');
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
    const pubKey = new rsa(fs.readFileSync('./public.key'));
    return pubKey.encrypt(key)
}

aesKey = crypto.randomBytes(16);

const file = fs.readFileSync('./output/index.json');

const cipher = new aesjs.ModeOfOperation.ecb(aesKey);
let buf = zlib.deflateRawSync(file, {level: 9});
const sz = buf.length;
buf = Buffer.from(cipher.encrypt(Buffer.concat([buf, Buffer.from('00'.repeat(0x10 - (sz % 0x10)), 'hex')])));

console.log(buf)

console.log(aesKey);

const streamWriter = fs.createWriteStream('./shop/test.json');

with (streamWriter) {
    write(Buffer.concat([Buffer.from('TINFOIL'), Buffer.from('FE', 'hex')]));
    write(wrapKey(aesKey));
    write(ReverseEndian(sz).toString(16));
    write(buf);
    close();
}