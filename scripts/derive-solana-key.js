const { Keypair } = require("@solana/web3.js");
const bip39 = require("bip39");
const { derivePath } = require("ed25519-hd-key");
const bs58 = require("bs58");

const mnemonic = process.argv[2];
if (!mnemonic) {
    console.error("Usage: node scripts/derive-solana-key.js \"word1 word2 ...\"");
    process.exit(1);
}

const seed = bip39.mnemonicToSeedSync(mnemonic, "");
const { key } = derivePath("m/44'/501'/0'/0'", seed.toString("hex"));
const keypair = Keypair.fromSeed(key);

console.log("Public key: ", keypair.publicKey.toBase58());
console.log("Private key:", bs58.encode(keypair.secretKey));
