import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=f6d14088-bcb9-4fca-a1c4-a8060d870ac5';
const MINT = '6MHKt49K5FSMHfreQDPgkt5MeCbxHfMgdbm2px8MPqbK';
const META_PROG = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const conn = new Connection(RPC);
const mint = new PublicKey(MINT);
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), META_PROG.toBuffer(), mint.toBuffer()],
  META_PROG
);

const info = await conn.getAccountInfo(pda);
const data = info.data;

// Print last 30 bytes to find collectionDetails manually
const last30 = data.slice(-30);
console.log('Account data length:', data.length);
console.log('Last 30 bytes hex:', last30.toString('hex'));

// Search for the collectionDetails pattern: 01 00 [8 bytes size LE]
// where the 8 bytes represent a reasonable size (1–100000)
for (let i = 0; i <= data.length - 10; i++) {
  if (data[i] === 1 && data[i+1] === 0) {
    const sizeLE = data.slice(i+2, i+10);
    const size = Number(sizeLE.readBigUInt64LE(0));
    if (size > 0 && size < 100000) {
      console.log(`Possible collectionDetails at offset ${i}: size = ${size}`);
    }
  }
}
