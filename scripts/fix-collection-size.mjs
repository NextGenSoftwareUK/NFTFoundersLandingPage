import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata, setCollectionSize } from '@metaplex-foundation/mpl-token-metadata';
import { readFileSync } from 'fs';

const COLLECTION_MINT = 'FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj';

// Load keypair from a JSON file containing the secret key bytes array
// e.g. [1,2,3,...] exported from Phantom or Solana CLI
const secretKey = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const umi = createUmi('https://api.mainnet-beta.solana.com')
  .use(mplTokenMetadata());

const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
umi.use(keypairIdentity(keypair));

console.log('Using authority:', keypair.publicKey);
console.log('Setting collectionDetails on:', COLLECTION_MINT);

const { signature } = await setCollectionSize(umi, {
  collectionMint: publicKey(COLLECTION_MINT),
  collectionAuthority: umi.identity,
  size: 1,
}).sendAndConfirm(umi);

console.log('Done! Tx:', Buffer.from(signature).toString('base64'));
console.log('Wait a few minutes then check Phantom again.');
