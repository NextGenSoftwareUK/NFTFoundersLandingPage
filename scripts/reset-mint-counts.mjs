// Resets mint_count:* keys in Redis back to 0.
// Run: REDIS_URL=your_url node scripts/reset-mint-counts.mjs
// Add --dry-run to just see current counts without resetting.

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) { console.error('REDIS_URL env var is required'); process.exit(1); }

const dryRun = process.argv.includes('--dry-run');

const client = createClient({ url: REDIS_URL });
client.on('error', err => console.error('Redis error:', err));
await client.connect();

const keys = ['mint_count:supporter', 'mint_count:core', 'mint_count:genesis'];

console.log('Current mint counts:');
for (const key of keys) {
  const val = await client.get(key);
  console.log(`  ${key}: ${val ?? 0}`);
}

if (dryRun) {
  console.log('\n--dry-run: no changes made.');
} else {
  for (const key of keys) {
    await client.set(key, '0');
  }
  console.log('\nAll mint counts reset to 0.');
}

await client.disconnect();
