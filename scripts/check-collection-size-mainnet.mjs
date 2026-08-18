import { Connection, PublicKey } from '@solana/web3.js';

const RPC  = 'https://mainnet.helius-rpc.com/?api-key=f6d14088-bcb9-4fca-a1c4-a8060d870ac5';
const MINT = '2uVFTptrWeQD4iunhNQKyMqor7eNQKe5RuiQfVM7R4eu';
const META_PROG = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const conn = new Connection(RPC);
const mint = new PublicKey(MINT);
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), META_PROG.toBuffer(), mint.toBuffer()],
  META_PROG
);

const info = await conn.getAccountInfo(pda);
const data = info.data;

console.log('Network:    MAINNET');
console.log('Mint:      ', MINT);
console.log('Data length:', data.length);

const OFFSET = 368;
const size = Number(data.slice(OFFSET + 2, OFFSET + 10).readBigUInt64LE(0));
console.log(`collectionDetails.size = ${size}`);
