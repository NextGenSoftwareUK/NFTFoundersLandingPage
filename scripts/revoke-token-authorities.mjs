// Revokes Mint Authority and Freeze Authority on NFT mint accounts.
// This removes the two RugCheck "DANGER" flags.
// ONE-WAY — cannot be undone.
//
// Usage:
//   node scripts/revoke-token-authorities.mjs <base58-private-key> <nft-mint-address>

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey, transactionBuilder } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const [,, keyArg, mintArg] = process.argv;

if (!keyArg || !mintArg) {
  console.error('Usage: node scripts/revoke-token-authorities.mjs <base58-private-key> <nft-mint-address>');
  process.exit(1);
}

const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplTokenMetadata());
const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(keyArg));
umi.use(keypairIdentity(keypair));

const mint = publicKey(mintArg);
const TOKEN_PROGRAM = publicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

console.log('Signer:', umi.identity.publicKey);
console.log('Mint  :', mintArg);

function revokeAuthorityIx(authorityType) {
  // SetAuthority instruction: [6, authorityType, 0 (None = revoke)]
  return {
    instruction: {
      programId: TOKEN_PROGRAM,
      keys: [
        { pubkey: mint,                    isSigner: false, isWritable: true },
        { pubkey: umi.identity.publicKey,  isSigner: true,  isWritable: false },
      ],
      data: new Uint8Array([6, authorityType, 0]),
    },
    signers: [umi.identity],
    bytesCreatedOnChain: 0,
  };
}

const { signature } = await transactionBuilder()
  .add(revokeAuthorityIx(0))  // MintTokens
  .add(revokeAuthorityIx(1))  // FreezeAccount
  .sendAndConfirm(umi);

console.log('Done! Tx:', Buffer.from(signature).toString('base64'));
console.log('Mint Authority and Freeze Authority revoked — RugCheck score will improve.');
