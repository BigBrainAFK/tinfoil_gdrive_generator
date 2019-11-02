#/bin/python3
import sys
import os
import base64
from Crypto.Signature import PKCS1_PSS
from Crypto.Cipher import PKCS1_OAEP
from Crypto.PublicKey import RSA 
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from binascii import hexlify as hx, unhexlify as uhx
import random
import Crypto.Hash
import zlib

if len(sys.argv) < 2:
	print('input file not specified')
	exit(-1)
	
if len(sys.argv) < 3:
	print('output file not specified')
	exit(-1)

pubKey = RSA.importKey(open('public.key').read())

def wrapKey(key):
	cipher = PKCS1_OAEP.new(pubKey, hashAlgo = Crypto.Hash.SHA256, label=b'')
	return cipher.encrypt(key)

aesKey = random.randint(0,0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF).to_bytes(0x10, 'big')

buf = None

with open(sys.argv[1], 'rb') as f:
	cipher = AES.new(aesKey, AES.MODE_ECB)
	buf = zlib.compress(f.read(), 9)
	sz = len(buf)
	buf = cipher.encrypt(buf + (b'\x00' * (0x10 - (sz % 0x10))))

print(aesKey)

with open(sys.argv[2], 'wb') as f:
	f.write(b'TINFOIL\xFE')
	f.write(wrapKey(aesKey))
	f.write(sz.to_bytes(8, 'little'))
	f.write(buf)
	
print('fin')