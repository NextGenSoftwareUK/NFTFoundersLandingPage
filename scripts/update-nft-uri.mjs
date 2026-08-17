// Updates the on-chain metadata URI for a single NFT to point to Arweave.
// NFT must still be mutable (isMutable = true) — frozen NFTs cannot be updated.
//
// Usage:
//   node scripts/update-nft-uri.mjs <base58-private-key> <nft-mint-address> <new-arweave-metadata-url>
//
// Example:
//   node scripts/update-nft-uri.mjs 2N5Cus... AaBbCc... https://arweave.net/xxxx

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import {
  mplTokenMetadata,
  fetchMetadata,
  findMetadataPda,
  updateMetadataAccountV2,
} from "@metaplex-foundation/mpl-token-metadata";
import bs58 from "bs58";

const [,, privateKey, mintAddress, newUri] = process.argv;

if (!privateKey || !mintAddress || !newUri) {
  console.error("Usage: node scripts/update-nft-uri.mjs <base58-private-key> <nft-mint-address> <new-arweave-metadata-url>");
  process.exit(1);
}

if (!newUri.startsWith("https://arweave.net/") && !newUri.startsWith("https://gateway.irys.xyz/")) {
  console.warn("Warning: URI doesn't look like an Arweave URL. Continuing anyway...");
}

const umi = createUmi("https://api.mainnet-beta.solana.com").use(mplTokenMetadata());
const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
umi.use(keypairIdentity(keypair));

const mint = publicKey(mintAddress);
const [metadataPda] = findMetadataPda(umi, { mint });
const metadata = await fetchMetadata(umi, metadataPda);

console.log(`NFT: ${mintAddress}`);
console.log(`Current URI: ${metadata.uri}`);
console.log(`New URI:     ${newUri}`);
console.log(`Mutable:     ${metadata.isMutable}`);

if (!metadata.isMutable) {
  console.error("\nERROR: This NFT is already frozen (isMutable = false). Cannot update URI.");
  process.exit(1);
}

console.log("\nUpdating on-chain URI...");

const { signature } = await updateMetadataAccountV2(umi, {
  metadata: metadataPda,
  updateAuthority: umi.identity,
  data: {
    name: metadata.name,
    symbol: metadata.symbol,
    uri: newUri,
    sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
    creators: metadata.creators,
    collection: metadata.collection,
    uses: metadata.uses,
  },
  isMutable: true,
}).sendAndConfirm(umi);

console.log("Done! Tx:", Buffer.from(signature).toString("base64"));
console.log(`\nOn-chain URI is now: ${newUri}`);
console.log("Verify in Phantom or on explorer.solana.com before freezing.");
console.log("\nTo freeze once verified:");
console.log(`  node scripts/freeze-metadata.mjs ${privateKey.slice(0,8)}... ${mintAddress}`);
