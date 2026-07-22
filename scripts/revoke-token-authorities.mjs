// Revokes Mint Authority and Freeze Authority on NFT mint accounts.
// This removes the two RugCheck "DANGER" flags.
// ONE-WAY — cannot be undone.
//
// Usage:
//   node scripts/revoke-token-authorities.mjs <base58-private-key> <nft-mint-address>

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createSetAuthorityInstruction, AuthorityType } from '@solana/spl-token';
import bs58 from 'bs58';

const [,, keyArg, mintArg] = process.argv;

if (!keyArg || !mintArg) {
  console.error('Usage: node scripts/revoke-token-authorities.mjs <base58-private-key> <nft-mint-address>');
  process.exit(1);
}

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const keypair = Keypair.fromSecretKey(bs58.decode(keyArg));
const mint = new PublicKey(mintArg);

console.log('Signer:', keypair.publicKey.toBase58());
console.log('Mint  :', mintArg);

const tx = new Transaction();

tx.add(createSetAuthorityInstruction(
  mint,
  keypair.publicKey,
  AuthorityType.MintTokens,
  null  // revoke
));

tx.add(createSetAuthorityInstruction(
  mint,
  keypair.publicKey,
  AuthorityType.FreezeAccount,
  null  // revoke
));

const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
console.log('Done! Tx:', sig);
console.log('Mint Authority and Freeze Authority revoked — RugCheck score will improve.');
