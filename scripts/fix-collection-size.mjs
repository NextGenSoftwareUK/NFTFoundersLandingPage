import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata, setCollectionSize, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const NETWORKS = {
  mainnet: {
    rpc: 'https://api.mainnet-beta.solana.com',
    collection: 'FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj',
  },
  devnet: {
    rpc: 'https://api.devnet.solana.com',
    collection: 'HrrzdjdLgsttkyM66uEAvsUWkCBukXx5sbGEaznjTdxF',
  },
};

// Usage:
//   node scripts/fix-collection-size.mjs <base58-private-key>           (mainnet)
//   node scripts/fix-collection-size.mjs <base58-private-key> --devnet  (devnet)
const arg     = process.argv[2];
const devnet  = process.argv.includes('--devnet');
const network = devnet ? 'devnet' : 'mainnet';

if (!arg) {
  console.error('Usage: node scripts/fix-collection-size.mjs <base58-private-key> [--devnet]');
  process.exit(1);
}

const { rpc, collection: COLLECTION_MINT } = NETWORKS[network];
const secretKey = bs58.decode(arg);

console.log('Network:', network);
const umi = createUmi(rpc).use(mplTokenMetadata());

const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
umi.use(keypairIdentity(keypair));

const collectionMintPubkey = publicKey(COLLECTION_MINT);
const [collectionMetadataPda] = findMetadataPda(umi, { mint: collectionMintPubkey });

console.log('Using authority:', keypair.publicKey);
console.log('Collection metadata PDA:', collectionMetadataPda);
console.log('Setting collectionDetails on:', COLLECTION_MINT);

const { signature } = await setCollectionSize(umi, {
  collectionMint: collectionMintPubkey,
  collectionMetadata: collectionMetadataPda,
  collectionAuthority: umi.identity,
  setCollectionSizeArgs: { size: 1 },
}).sendAndConfirm(umi);

console.log('Done! Tx:', Buffer.from(signature).toString('base64'));
console.log('Wait a few minutes then check Phantom again.');
