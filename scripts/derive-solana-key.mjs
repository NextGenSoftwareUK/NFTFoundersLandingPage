import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync } from "bip39";
import { derivePath } from "ed25519-hd-key";
import bs58 from "bs58";

const mnemonic = process.argv[2];
const accountIndex = parseInt(process.argv[3] ?? "0");

if (!mnemonic) {
    console.error("Usage: node scripts/derive-solana-key.mjs \"word1 word2 ...\" [account-index]");
    console.error("  account-index 0 = first wallet (default), 1 = second, 2 = third, etc.");
    process.exit(1);
}

const seed = mnemonicToSeedSync(mnemonic, "");
const { key } = derivePath(`m/44'/501'/${accountIndex}'/0'`, seed.toString("hex"));
const keypair = Keypair.fromSeed(key);

console.log(`Account index: ${accountIndex}`);
console.log("Public key:  ", keypair.publicKey.toBase58());
console.log("Private key: ", bs58.encode(keypair.secretKey));
