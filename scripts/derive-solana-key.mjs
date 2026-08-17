import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync } from "bip39";
import { derivePath } from "ed25519-hd-key";
import bs58 from "bs58";

const mnemonic = process.argv[2];
if (!mnemonic) {
    console.error("Usage: node scripts/derive-solana-key.mjs \"word1 word2 ...\"");
    process.exit(1);
}

const seed = mnemonicToSeedSync(mnemonic, "");
const { key } = derivePath("m/44'/501'/0'/0'", seed.toString("hex"));
const keypair = Keypair.fromSeed(key);

console.log("Public key: ", keypair.publicKey.toBase58());
console.log("Private key:", bs58.encode(keypair.secretKey));
