/**
 * Copies all live Redis data into the test: namespace.
 * Run this before nuking live so test env has a snapshot of real data.
 *
 * Usage:
 *   node scripts/copy-live-to-test.mjs
 *   node scripts/copy-live-to-test.mjs --dry-run
 */

import { createClient } from 'redis';
import { existsSync } from 'fs';
import { config } from 'dotenv';

for (const f of ['.env.local', '.env']) {
  if (existsSync(f)) { config({ path: f }); break; }
}

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) { console.error('REDIS_URL env var is required'); process.exit(1); }

const dryRun = process.argv.includes('--dry-run');
if (dryRun) console.log('DRY RUN — no changes will be made\n');

const client = createClient({ url: REDIS_URL, socket: { reconnectStrategy: false } });
client.on('error', err => console.error('Redis error:', err));
await client.connect();

let copied = 0;

// ── Mint counts ───────────────────────────────────────────────────────────────
for (const tier of ['genesis', 'core', 'supporter']) {
  const val = await client.get(`mint_count:${tier}`);
  if (val !== null) {
    console.log(`mint_count:${tier} = ${val}  →  test:mint_count:${tier}`);
    if (!dryRun) await client.set(`test:mint_count:${tier}`, val);
    copied++;
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────
const orderKeys = await client.keys('order:*');
console.log(`\nFound ${orderKeys.length} order(s)`);
for (const key of orderKeys) {
  const val = await client.get(key);
  const testKey = `test:${key}`;
  console.log(`  ${key}  →  ${testKey}`);
  if (!dryRun && val !== null) await client.set(testKey, val);
  copied++;
}

// ── Waitlist ──────────────────────────────────────────────────────────────────
const emails = await client.sMembers('waitlist:emails');
console.log(`\nFound ${emails.length} waitlist email(s)`);
if (emails.length) {
  console.log(`  waitlist:emails  →  test:waitlist:emails`);
  if (!dryRun) await client.sAdd('test:waitlist:emails', emails);
  copied++;
}

// ── Done ──────────────────────────────────────────────────────────────────────
await client.disconnect();
console.log(`\n${dryRun ? '[DRY RUN] Would have copied' : 'Copied'} ${copied} item(s) into test: namespace.`);
if (!dryRun) console.log('You can now safely nuke live data from the admin panel.');
