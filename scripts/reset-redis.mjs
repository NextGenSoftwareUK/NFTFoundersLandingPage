/**
 * Full Redis reset script for the NFT Founders Landing Page.
 *
 * Usage:
 *   node scripts/reset-redis.mjs [options]
 *
 * Options:
 *   --test         Target REDIS_URL_TEST instead of REDIS_URL
 *   --dry-run      Print what would be deleted without making changes
 *   --counts       Reset only mint counts (mint_count:*)
 *   --orders       Delete only orders (order:*)
 *   --locks        Delete only price locks (lock:*)
 *   --waitlist     Clear only waitlist:emails set
 *   --all          Reset everything (default when no scope flag given)
 *
 * Examples:
 *   node scripts/reset-redis.mjs --test --dry-run
 *   node scripts/reset-redis.mjs --test --counts --orders
 *   node scripts/reset-redis.mjs --all
 */

import { createClient } from 'redis';
import { existsSync } from 'fs';
import { config } from 'dotenv';

// Auto-load .env.local if present (never committed — see .gitignore)
for (const f of ['.env.local', '.env']) {
  if (existsSync(f)) { config({ path: f }); break; }
}

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);

const useTest  = flag('--test');
const dryRun   = flag('--dry-run');
const doAll    = flag('--all') || !['--counts','--orders','--locks','--waitlist'].some(f => args.includes(f));
const doCounts   = doAll || flag('--counts');
const doOrders   = doAll || flag('--orders');
const doLocks    = doAll || flag('--locks');
const doWaitlist = doAll || flag('--waitlist');

// ── Connection ────────────────────────────────────────────────────────────────
const redisUrl = useTest ? process.env.REDIS_URL_TEST : process.env.REDIS_URL;

if (!redisUrl) {
  const varName = useTest ? 'REDIS_URL_TEST' : 'REDIS_URL';
  console.error(`\n  Error: ${varName} is not set.\n`);
  process.exit(1);
}

const client = createClient({ url: redisUrl });
client.on('error', err => console.error('Redis error:', err));

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, label) => `${n} ${label}${n !== 1 ? 's' : ''}`;

async function scanKeys(pattern) {
  const keys = [];
  for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 200 })) {
    keys.push(key);
  }
  return keys;
}

async function deleteKeys(keys, label) {
  if (!keys.length) { console.log(`  ${label}: none found`); return 0; }
  if (dryRun) {
    console.log(`  ${label}: would delete ${fmt(keys.length, 'key')}:`);
    for (const k of keys) console.log(`    - ${k}`);
    return 0;
  }
  await client.del(keys);
  console.log(`  ${label}: deleted ${fmt(keys.length, 'key')}`);
  return keys.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────
await client.connect();

const db = useTest ? 'TEST (REDIS_URL_TEST)' : 'LIVE (REDIS_URL)';
console.log(`\n── NFT Founders Redis Reset ──────────────────────────────────────`);
console.log(`   Database : ${db}`);
console.log(`   Mode     : ${dryRun ? 'DRY RUN — no changes will be made' : 'LIVE — changes will be applied'}`);
console.log(`   Scope    : ${[doCounts && 'counts', doOrders && 'orders', doLocks && 'locks', doWaitlist && 'waitlist'].filter(Boolean).join(', ')}`);
console.log(`──────────────────────────────────────────────────────────────────\n`);

// ── Show current state ────────────────────────────────────────────────────────
const MINT_KEYS = ['mint_count:genesis', 'mint_count:core', 'mint_count:supporter'];
const [g, c, s] = await client.mGet(MINT_KEYS);
console.log('Current state:');
console.log(`  mint_count:genesis   = ${g ?? 0}`);
console.log(`  mint_count:core      = ${c ?? 0}`);
console.log(`  mint_count:supporter = ${s ?? 0}`);

const orderKeys = await scanKeys('order:*');
console.log(`  order:*              = ${fmt(orderKeys.length, 'key')}`);

const lockKeys = await scanKeys('lock:*');
console.log(`  lock:*               = ${fmt(lockKeys.length, 'key')}`);

const waitlistCount = await client.sCard('waitlist:emails');
console.log(`  waitlist:emails      = ${fmt(waitlistCount, 'member')}\n`);

if (!dryRun) {
  // Safety prompt — require explicit --yes in non-interactive environments
  const hasYes = flag('--yes');
  if (!hasYes && process.stdin.isTTY) {
    process.stdout.write('  Proceed? [y/N] ');
    const answer = await new Promise(resolve => {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', chunk => resolve(chunk.trim().toLowerCase()));
    });
    if (answer !== 'y' && answer !== 'yes') {
      console.log('\n  Aborted — no changes made.\n');
      await client.disconnect();
      process.exit(0);
    }
    console.log();
  } else if (!hasYes) {
    console.log('  Pass --yes to confirm in non-interactive mode, or add --dry-run to preview.\n');
    await client.disconnect();
    process.exit(1);
  }
}

// ── Apply resets ──────────────────────────────────────────────────────────────
console.log('Changes:');

if (doCounts) {
  if (dryRun) {
    console.log('  mint counts: would reset genesis, core, supporter to 0');
  } else {
    await client.mSet([
      'mint_count:genesis',   '0',
      'mint_count:core',      '0',
      'mint_count:supporter', '0',
    ]);
    console.log('  mint counts: reset genesis, core, supporter → 0');
  }
}

if (doOrders)   await deleteKeys(orderKeys, 'orders');
if (doLocks)    await deleteKeys(lockKeys,  'price locks');

if (doWaitlist) {
  if (waitlistCount === 0) {
    console.log('  waitlist:emails: empty, nothing to clear');
  } else if (dryRun) {
    const emails = await client.sMembers('waitlist:emails');
    console.log(`  waitlist:emails: would remove ${fmt(waitlistCount, 'email')}:`);
    for (const e of emails.sort()) console.log(`    - ${e}`);
  } else {
    await client.del('waitlist:emails');
    console.log(`  waitlist:emails: cleared ${fmt(waitlistCount, 'email')}`);
  }
}

console.log(`\n${dryRun ? 'Dry run complete — nothing was changed.' : 'Reset complete.'}\n`);

await client.disconnect();
