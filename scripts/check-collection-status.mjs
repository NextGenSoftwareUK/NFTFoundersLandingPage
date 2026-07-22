import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata, fetchMetadata, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';

const COLLECTION_MINT = 'FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj';
const CHILD_MINT     = '9oWmgYCMP6bDEUnjM9NiiwKMfiGjgffaG4faWZjd97zU';

const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplTokenMetadata());

const stringify = (v) => JSON.stringify(v, (_, val) => typeof val === 'bigint' ? val.toString() : val);

async function check(label, mintAddress) {
  const mint = publicKey(mintAddress);
  const [pda] = findMetadataPda(umi, { mint });
  const meta = await fetchMetadata(umi, pda);
  console.log(`\n=== ${label} (${mintAddress}) ===`);
  console.log('  name            :', meta.name);
  console.log('  updateAuthority :', meta.updateAuthority);
  console.log('  collection      :', stringify(meta.collection));
  console.log('  collectionDetails:', stringify(meta.collectionDetails));
  return meta;
}

const colMeta   = await check('COLLECTION NFT', COLLECTION_MINT);
const childMeta = await check('CHILD NFT',      CHILD_MINT);

console.log('\n=== DIAGNOSIS ===');

const hasDetails = colMeta.collectionDetails?.__option === 'Some';
console.log('collectionDetails set on collection NFT:', hasDetails ? 'YES ✓' : 'NO ✗  ← run fix-collection-size.mjs');

const childPoints = childMeta.collection?.__option === 'Some' &&
                    childMeta.collection.value?.key === COLLECTION_MINT;
console.log('child NFT points to collection:         ', childPoints ? 'YES ✓' : 'NO ✗');

const childVerified = childMeta.collection?.value?.verified === true;
console.log('child NFT collection.verified = true:   ', childVerified ? 'YES ✓' : 'NO ✗  ← needs SetAndVerifyCollection');

if (hasDetails && childPoints && childVerified) {
  console.log('\nAll on-chain data looks correct. If Phantom still does not show it:');
  console.log('  1. Pull-to-refresh the wallet in Phantom');
  console.log('  2. Wait a further 10-30 min for Helius to finish re-indexing');
  console.log('  3. Check the Collectibles tab (not just Collections)');
} else {
  console.log('\nThere is an on-chain issue — see ✗ items above.');
}
