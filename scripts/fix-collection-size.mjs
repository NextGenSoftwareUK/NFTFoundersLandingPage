import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata, setCollectionSize } from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const COLLECTION_MINT = 'FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj';

// Pass the Phantom private key (base58 string) as the first argument:
//   node scripts/fix-collection-size.mjs <base58-private-key>
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/fix-collection-size.mjs <base58-private-key>');
  console.error('  Get the key from Phantom → Settings → Export Private Key');
  process.exit(1);
}

const secretKey = bs58.decode(arg);

const umi = createUmi('https://api.mainnet-beta.solana.com')
  .use(mplTokenMetadata());

const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
umi.use(keypairIdentity(keypair));

console.log('Using authority:', keypair.publicKey);
console.log('Setting collectionDetails on:', COLLECTION_MINT);

const { signature } = await setCollectionSize(umi, {
  collectionMint: publicKey(COLLECTION_MINT),
  collectionAuthority: umi.identity,
  setCollectionSizeArgs: { size: 1 },
}).sendAndConfirm(umi);

console.log('Done! Tx:', Buffer.from(signature).toString('base64'));
console.log('Wait a few minutes then check Phantom again.');
