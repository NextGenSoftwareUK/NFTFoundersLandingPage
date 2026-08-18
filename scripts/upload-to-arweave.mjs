// Uploads NFT images and metadata JSONs to Arweave via Irys (pay with SOL).
// Updates local metadata JSON files with the new Arweave image URIs.
//
// Usage:
//   node scripts/upload-to-arweave.mjs <base58-mint-wallet-private-key>
//
// Run with --dry-run to check prices without uploading.
// Run with --devnet to use devnet (free, for testing).

import { Uploader } from "@irys/upload";
import Solana from "@irys/upload-solana";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const privateKey = args.find(a => !a.startsWith("--"));
const isDryRun = args.includes("--dry-run");

if (!privateKey) {
  console.error("Usage: node scripts/upload-to-arweave.mjs <base58-private-key> [--dry-run]");
  process.exit(1);
}

const RPC = "https://api.mainnet-beta.solana.com";

const IMAGES = [
  { file: "img/nft-genesis-wallet.png",      key: "genesis" },
  { file: "img/nft-core-wallet.png",         key: "core" },
  { file: "img/nft-supporter-wallet.png",    key: "supporter" },
  { file: "img/nft-founder-collection.png",  key: "collection" },
];

const METADATA = [
  { file: "metadata/tier-genesis.json",      key: "genesis" },
  { file: "metadata/tier-core.json",         key: "core" },
  { file: "metadata/tier-supporter.json",    key: "supporter" },
  { file: "metadata/founder-collection.json",key: "collection" },
];

async function getIrys() {
  const irys = await Uploader(Solana)
    .withWallet(privateKey)
    .withRpc(RPC)
    .mainnet()
    .build();
  await irys.ready();
  return irys;
}

async function checkPrice(irys, files) {
  let totalBytes = 0;
  for (const f of files) {
    const stat = fs.statSync(path.join(ROOT, f.file));
    totalBytes += stat.size;
    console.log(`  ${f.file}: ${(stat.size / 1024).toFixed(1)} KB`);
  }
  const price = await irys.getPrice(totalBytes);
  console.log(`\nTotal size: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`Estimated cost: ${irys.utils.fromAtomic(price).toFixed(8)} SOL`);
  return price;
}

async function upload(irys, filePath, contentType) {
  const data = fs.readFileSync(path.join(ROOT, filePath));
  const receipt = await irys.upload(data, {
    tags: [{ name: "Content-Type", value: contentType }],
  });
  return `https://arweave.net/${receipt.id}`;
}

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"} | Network: mainnet\n`);

  const irys = await getIrys();

  const balance = await irys.getLoadedBalance();
  console.log(`Irys balance: ${irys.utils.fromAtomic(balance).toFixed(8)} SOL`);

  console.log("\n--- Files to upload ---");
  const allFiles = [...IMAGES, ...METADATA];
  const estimatedPrice = await checkPrice(irys, allFiles);

  if (isDryRun) {
    console.log("\nDry run complete. Remove --dry-run to upload.");
    return;
  }

  // Fund Irys node if balance is insufficient
  if (balance < estimatedPrice) {
    const needed = estimatedPrice - balance;
    console.log(`\nFunding Irys with ${irys.utils.fromAtomic(needed).toFixed(8)} SOL from your wallet...`);
    await irys.fund(needed);
    console.log("Funded.");
  } else {
    console.log(`\nIrys balance sufficient — no funding needed.`);
  }

  // Step 1: Upload images
  console.log("\n--- Uploading images ---");
  const imageUrls = {};
  for (const img of IMAGES) {
    process.stdout.write(`Uploading ${img.file}... `);
    const url = await upload(irys, img.file, "image/png");
    imageUrls[img.key] = url;
    console.log(url);
  }

  // Step 2: Update local metadata JSONs with new image URLs
  console.log("\n--- Updating local metadata JSONs ---");
  for (const meta of METADATA) {
    const fullPath = path.join(ROOT, meta.file);
    const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const arweaveImageUrl = imageUrls[meta.key];
    json.image = arweaveImageUrl;
    json.properties.files[0].uri = arweaveImageUrl;
    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
    console.log(`Updated ${meta.file} → ${arweaveImageUrl}`);
  }

  // Step 3: Upload updated metadata JSONs
  console.log("\n--- Uploading metadata JSONs ---");
  const metadataUrls = {};
  for (const meta of METADATA) {
    process.stdout.write(`Uploading ${meta.file}... `);
    const url = await upload(irys, meta.file, "application/json");
    metadataUrls[meta.key] = url;
    console.log(url);
  }

  // Print summary
  console.log("\n========================================");
  console.log("UPLOAD COMPLETE — save these URLs!");
  console.log("========================================");
  console.log("\nImage URLs (Arweave):");
  for (const [k, v] of Object.entries(imageUrls)) console.log(`  ${k}: ${v}`);
  console.log("\nMetadata URLs (Arweave) — use these for on-chain update:");
  for (const [k, v] of Object.entries(metadataUrls)) console.log(`  ${k}: ${v}`);
  console.log("\nNext step:");
  console.log("  node scripts/update-nft-uri.mjs <private-key> <nft-mint-address> <arweave-metadata-url>");
  console.log("\nSave this summary before closing the terminal!");
}

main().catch(err => { console.error(err); process.exit(1); });
