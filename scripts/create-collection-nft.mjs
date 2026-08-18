// Creates a new Metaplex collection NFT on Solana devnet or mainnet.
// This bypasses the OASIS API so we have full control over URI and freeze flag.
//
// Usage:
//   node scripts/create-collection-nft.mjs <base58-private-key> [--mainnet] [--freeze]
//
// Defaults to devnet. Pass --mainnet for mainnet-beta.
// Pass --freeze to set isMutable=false after creation.

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import bs58 from "bs58";
import "dotenv/config";

const args = process.argv.slice(2);
const privateKeyArg = args.find(a => !a.startsWith("--"));
const isMainnet = args.includes("--mainnet");
const freeze = args.includes("--freeze");

if (!privateKeyArg) {
  console.error("Usage: node scripts/create-collection-nft.mjs <base58-private-key> [--mainnet] [--freeze]");
  process.exit(1);
}

const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyArg));
console.log("Wallet:", keypair.publicKey.toBase58());

const cluster = isMainnet ? "mainnet-beta" : "devnet";
const rpc = isMainnet
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : clusterApiUrl("devnet");

console.log("Network:", cluster);
console.log("RPC:", isMainnet ? "Helius mainnet" : "devnet");

const connection = new Connection(rpc, "confirmed");
const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));

const metadataUri = isMainnet
  ? "https://founders.oasisomniverse.one/metadata/founder-collection.json"
  : "https://founders.oasisomniverse.one/metadata/founder-collection.json";

console.log("\nCreating collection NFT...");
console.log("Metadata URI:", metadataUri);
console.log("isMutable:", !freeze);

const { nft } = await metaplex.nfts().create({
  name: "OASIS Founders Collection",
  symbol: "OASISFNDR",
  uri: metadataUri,
  sellerFeeBasisPoints: 0,
  isCollection: true,
  isMutable: !freeze,
});

console.log("\n✅ Collection NFT created!");
console.log("Mint address:", nft.address.toBase58());
console.log("Update authority:", nft.updateAuthorityAddress.toBase58());
console.log("isMutable:", nft.isMutable);
console.log("\nUpdate COLLECTION_PUBLIC_KEY_" + (isMainnet ? "LIVE" : "TEST") + " to:", nft.address.toBase58());
