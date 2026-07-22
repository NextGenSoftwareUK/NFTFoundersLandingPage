import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import {
  mplTokenMetadata,
  fetchMetadata,
  findMetadataPda,
  findMasterEditionPda,
  setAndVerifySizedCollectionItem,
} from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const COLLECTION_MINT = 'FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj';

const arg     = process.argv[2];
const NFT_MINT = process.argv[3] || '4cKugJX8HgCXq663WZD3VV2N8iu3yZ8nsV4pqN3q4KH2';

if (!arg) {
  console.error('Usage: node scripts/verify-nft-collection.mjs <base58-private-key> [nft-mint-address]');
  process.exit(1);
}

const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplTokenMetadata());
const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(arg));
umi.use(keypairIdentity(keypair));

const stringify = (v) => JSON.stringify(v, (_, val) => typeof val === 'bigint' ? val.toString() : val);

// Check current state
const nftMint        = publicKey(NFT_MINT);
const collectionMint = publicKey(COLLECTION_MINT);
const [nftMetaPda]   = findMetadataPda(umi, { mint: nftMint });
const [colMetaPda]   = findMetadataPda(umi, { mint: collectionMint });
const [colEditionPda] = findMasterEditionPda(umi, { mint: collectionMint });

const nftMeta = await fetchMetadata(umi, nftMetaPda);
console.log('NFT collection field:', stringify(nftMeta.collection));
console.log('NFT verified:', nftMeta.collection?.__option === 'Some' && nftMeta.collection.value.verified);

if (nftMeta.collection?.__option === 'Some' && nftMeta.collection.value.verified) {
  console.log('Already verified — nothing to do!');
  process.exit(0);
}

console.log('\nAttempting setAndVerifySizedCollectionItem via UMI...');

// Instruction 25 (SetAndVerifyCollection) is blocked for sized collections.
// Instruction 32 (SetAndVerifySizedCollectionItem) is the correct one.
const { signature } = await setAndVerifySizedCollectionItem(umi, {
  metadata:                       nftMetaPda,
  collectionAuthority:            umi.identity,
  collectionMint:                 collectionMint,
  collection:                     colMetaPda,
  collectionMasterEditionAccount: colEditionPda,
}).sendAndConfirm(umi);

console.log('Done! Tx:', Buffer.from(signature).toString('base64'));
console.log('NFT should now appear in Phantom Collections within a few minutes.');
