/**
 * Snapshots current test: data into the archived: namespace.
 * Existing archived: keys are overwritten.
 *
 * Usage:
 *   node scripts/copy-test-to-archived.mjs
 *   node scripts/copy-test-to-archived.mjs --dry-run
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
  const val = await client.get(`test:mint_count:${tier}`);
  if (val !== null) {
    console.log(`test:mint_count:${tier} = ${val}  →  archived:mint_count:${tier}`);
    if (!dryRun) await client.set(`archived:mint_count:${tier}`, val);
    copied++;
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────
const orderKeys = await client.keys('test:order:*');
console.log(`\nFound ${orderKeys.length} test order(s)`);
for (const key of orderKeys) {
  const val = await client.get(key);
  const archivedKey = key.replace(/^test:/, 'archived:');
  console.log(`  ${key}  →  ${archivedKey}`);
  if (!dryRun && val !== null) await client.set(archivedKey, val);
  copied++;
}

// ── Waitlist ──────────────────────────────────────────────────────────────────
const emails = await client.sMembers('test:waitlist:emails');
console.log(`\nFound ${emails.length} test waitlist email(s)`);
if (emails.length) {
  console.log(`  test:waitlist:emails  →  archived:waitlist:emails`);
  if (!dryRun) {
    await client.del('archived:waitlist:emails');
    await client.sAdd('archived:waitlist:emails', emails);
  }
  copied++;
}

await client.disconnect();
console.log(`\n${dryRun ? '[DRY RUN] Would have copied' : 'Copied'} ${copied} item(s) into archived: namespace.`);
