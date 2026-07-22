// Makes NFT metadata immutable (isMutable = false).
// ONE-WAY — cannot be undone. Run only when metadata is final.
//
// Usage:
//   node scripts/freeze-metadata.mjs <base58-private-key> <nft-mint-address>

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import {
  mplTokenMetadata,
  fetchMetadata,
  findMetadataPda,
  updateV1,
} from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const [,, arg, mintArg] = process.argv;

if (!arg || !mintArg) {
  console.error('Usage: node scripts/freeze-metadata.mjs <base58-private-key> <nft-mint-address>');
  process.exit(1);
}

const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplTokenMetadata());
const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(arg));
umi.use(keypairIdentity(keypair));

const mint = publicKey(mintArg);
const [metadataPda] = findMetadataPda(umi, { mint });
const metadata = await fetchMetadata(umi, metadataPda);

if (!metadata.isMutable) {
  console.log('Already immutable — nothing to do.');
  process.exit(0);
}

console.log(`Freezing metadata for ${mintArg}...`);

const { signature } = await updateV1(umi, {
  mint,
  authority: umi.identity,
  isMutable: false,
}).sendAndConfirm(umi);

console.log('Done! Tx:', Buffer.from(signature).toString('base64'));
console.log('Metadata is now immutable — RugCheck score will improve.');
