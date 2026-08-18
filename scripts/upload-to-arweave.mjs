// Uploads NFT images and metadata JSONs to Arweave via Irys (pay with SOL).
// Updates local metadata JSON files with the new Arweave image URIs.
//
// Usage:
//   node scripts/upload-to-arweave.mjs <base58-mint-wallet-private-key>
//
// Run with --dry-run to check prices without uploading.
// Run with --metadata-only to re-upload just the metadata JSONs (images already uploaded).
//   Uses existing _arweave_image hashes from local metadata files.

import "dotenv/config";
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
const metadataOnly = args.includes("--metadata-only");

if (!privateKey) {
  console.error("Usage: node scripts/upload-to-arweave.mjs <base58-private-key> [--dry-run]");
  process.exit(1);
}

// Use Helius RPC if available (more reliable than public endpoint), else fall back
const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://solana-mainnet.g.alchemy.com/v2/demo";

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

// Always use gateway.irys.xyz — more reliable than arweave.net
const GATEWAY = "https://gateway.irys.xyz";

async function upload(irys, filePath, contentType) {
  const data = fs.readFileSync(path.join(ROOT, filePath));
  const receipt = await irys.upload(data, {
    tags: [{ name: "Content-Type", value: contentType }],
  });
  return `${GATEWAY}/${receipt.id}`;
}

async function main() {
  const mode = isDryRun ? "DRY RUN" : metadataOnly ? "METADATA-ONLY" : "FULL UPLOAD";
  console.log(`Mode: ${mode} | Network: mainnet\n`);

  const irys = await getIrys();

  console.log(`Wallet address: ${irys.address}`);
  const balance = await irys.getLoadedBalance();
  console.log(`Irys balance: ${irys.utils.fromAtomic(balance).toFixed(8)} SOL`);

  const filesToUpload = metadataOnly ? METADATA : [...IMAGES, ...METADATA];

  console.log("\n--- Files to upload ---");
  const estimatedPrice = await checkPrice(irys, filesToUpload);

  if (isDryRun) {
    console.log("\nDry run complete. Remove --dry-run to upload.");
    return;
  }

  // Fund Irys node if balance is insufficient
  if (balance < estimatedPrice) {
    const needed = estimatedPrice - balance;
    console.log(`\nFunding Irys with ${irys.utils.fromAtomic(needed).toFixed(8)} SOL from your wallet...`);
    try {
      await irys.fund(needed);
      console.log("Funded.");
    } catch (err) {
      if (err.getLogs) {
        const logs = await err.getLogs();
        console.error("Transaction logs:", logs);
      }
      throw err;
    }
  } else {
    console.log(`\nIrys balance sufficient — no funding needed.`);
  }

  const imageUrls = {};

  if (!metadataOnly) {
    // Step 1: Upload images
    console.log("\n--- Uploading images ---");
    for (const img of IMAGES) {
      process.stdout.write(`Uploading ${img.file}... `);
      const url = await upload(irys, img.file, "image/png");
      imageUrls[img.key] = url;
      console.log(url);
    }
  } else {
    // Use existing _arweave_image hashes from local metadata, swap to gateway.irys.xyz
    console.log("\n--- Using existing image hashes from _arweave_image fields ---");
    for (const meta of METADATA) {
      const json = JSON.parse(fs.readFileSync(path.join(ROOT, meta.file), "utf8"));
      if (!json._arweave_image) {
        console.error(`Missing _arweave_image in ${meta.file} — run full upload first`);
        process.exit(1);
      }
      const hash = json._arweave_image.replace(/^https?:\/\/[^/]+\//, "");
      imageUrls[meta.key] = `${GATEWAY}/${hash}`;
      console.log(`  ${meta.key}: ${imageUrls[meta.key]}`);
    }
  }

  // Step 2: Update local metadata JSONs with gateway.irys.xyz image URLs
  console.log("\n--- Updating local metadata JSONs ---");
  for (const meta of METADATA) {
    const fullPath = path.join(ROOT, meta.file);
    const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const imageUrl = imageUrls[meta.key];
    json.image = imageUrl;
    json.properties.files[0].uri = imageUrl;
    // Store the irys gateway URL as reference too
    json._irys_image = imageUrl;
    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
    console.log(`Updated ${meta.file} → ${imageUrl}`);
  }

  // Step 3: Upload updated metadata JSONs
  console.log("\n--- Uploading metadata JSONs ---");
  const metadataUrls = {};
  for (const meta of METADATA) {
    process.stdout.write(`Uploading ${meta.file}... `);
    const url = await upload(irys, meta.file, "application/json");
    metadataUrls[meta.key] = url;
    // Save new metadata URL into local file
    const fullPath = path.join(ROOT, meta.file);
    const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    json._arweave_metadata = url;
    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
    console.log(url);
  }

  // Print summary
  console.log("\n========================================");
  console.log("UPLOAD COMPLETE — save these URLs!");
  console.log("========================================");
  console.log("\nImage URLs (gateway.irys.xyz):");
  for (const [k, v] of Object.entries(imageUrls)) console.log(`  ${k}: ${v}`);
  console.log("\nMetadata URLs — use these for on-chain URI update:");
  for (const [k, v] of Object.entries(metadataUrls)) console.log(`  ${k}: ${v}`);
  console.log("\nNext step:");
  console.log("  node scripts/update-nft-uri.mjs <private-key> <nft-mint-address> <metadata-url>");
  console.log("\nSave this summary before closing the terminal!");
}

main().catch(err => { console.error(err); process.exit(1); });
