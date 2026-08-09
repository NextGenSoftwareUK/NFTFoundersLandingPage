/**
 * Full Redis reset script for the NFT Founders Landing Page.
 *
 * Live keys are unprefixed.  Test keys use a "test:" prefix — same Redis
 * instance, isolated by prefix when TEST_MODE=true.
 *
 * Usage:
 *   node scripts/reset-redis.mjs [options]
 *
 * Options:
 *   --test         Target test: prefixed keys instead of live keys
 *   --dry-run      Print what would be deleted without making changes
 *   --counts       Reset only mint counts
 *   --orders       Delete only orders
 *   --locks        Delete only price locks
 *   --waitlist     Clear only waitlist:emails set
 *   --all          Reset everything (default when no scope flag given)
 *   --yes          Skip confirmation prompt (for non-interactive use)
 *
 * Examples:
 *   node scripts/reset-redis.mjs --dry-run
 *   node scripts/reset-redis.mjs --test --dry-run
 *   node scripts/reset-redis.mjs --test --all --yes
 *   node scripts/reset-redis.mjs --counts --yes
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

const useTest    = flag('--test');
const dryRun     = flag('--dry-run');
const doAll      = flag('--all') || !['--counts','--orders','--locks','--waitlist'].some(f => args.includes(f));
const doCounts   = doAll || flag('--counts');
const doOrders   = doAll || flag('--orders');
const doLocks    = doAll || flag('--locks');
const doWaitlist = doAll || flag('--waitlist');

// ── Key prefix ────────────────────────────────────────────────────────────────
const P = useTest ? 'test:' : '';

const MINT_KEYS = [
  `${P}mint_count:genesis`,
  `${P}mint_count:core`,
  `${P}mint_count:supporter`,
];
const MINT_LIMITS = { genesis: 20, core: 50, supporter: 100 };

// ── Connection ────────────────────────────────────────────────────────────────
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('\n  Error: REDIS_URL is not set.\n');
  process.exit(1);
}

const client = createClient({ url: redisUrl });
client.on('error', err => console.error('Redis error:', err));

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, label) => `${n} ${label}${n !== 1 ? 's' : ''}`;

// redis v5 scanIterator yields batches (string[]), not individual strings
async function scanKeys(pattern) {
  const keys = [];
  for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 200 })) {
    if (Array.isArray(batch)) keys.push(...batch);
    else keys.push(batch);
  }
  return keys;
}

async function fetchOrders(keys) {
  if (!keys.length) return [];
  const raws = await client.mGet(keys);
  const orders = [];
  for (const raw of raws) {
    if (!raw) continue;
    try { orders.push(JSON.parse(raw)); } catch {}
  }
  return orders;
}

function orderBreakdown(orders) {
  const byTier = {};
  for (const o of orders) {
    const tier = o.tier ?? 'unknown';
    if (!byTier[tier]) byTier[tier] = { total: 0, paid: 0, pending: 0, used: 0, other: 0 };
    byTier[tier].total++;
    const s = o.status;
    if (s === 'paid' || s === 'pending' || s === 'used') byTier[tier][s]++;
    else byTier[tier].other++;
  }
  return byTier;
}

async function deleteKeys(keys, label) {
  if (!keys.length) { console.log(`  ${label}: none found`); return; }
  if (dryRun) {
    console.log(`  ${label}: would delete ${fmt(keys.length, 'key')}`);
    return;
  }
  await client.del(keys);
  console.log(`  ${label}: deleted ${fmt(keys.length, 'key')}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
await client.connect();

const scope = useTest ? `TEST (prefix: "test:")` : 'LIVE (no prefix)';
console.log(`\n── NFT Founders Redis Reset ──────────────────────────────────────`);
console.log(`   Scope    : ${scope}`);
console.log(`   Mode     : ${dryRun ? 'DRY RUN — no changes will be made' : 'LIVE — changes will be applied'}`);
console.log(`   Targets  : ${[doCounts && 'counts', doOrders && 'orders', doLocks && 'locks', doWaitlist && 'waitlist'].filter(Boolean).join(', ')}`);
console.log(`──────────────────────────────────────────────────────────────────\n`);

// ── Current state ─────────────────────────────────────────────────────────────
const [g, c, s] = await client.mGet(MINT_KEYS);
const mintCounts = {
  genesis:   parseInt(g ?? '0', 10),
  core:      parseInt(c ?? '0', 10),
  supporter: parseInt(s ?? '0', 10),
};

console.log('Mint counts:');
for (const [tier, count] of Object.entries(mintCounts)) {
  const limit = MINT_LIMITS[tier];
  const pct   = limit ? Math.round((count / limit) * 100) : 0;
  console.log(`  ${tier.padEnd(10)} ${String(count).padStart(3)} / ${limit}  (${pct}%)`);
}

const orderKeys = await scanKeys(`${P}order:*`);
const lockKeys  = await scanKeys(`${P}lock:*`);
const orders    = await fetchOrders(orderKeys);

console.log(`\nOrders: ${fmt(orders.length, 'total')}`);
if (orders.length) {
  const byTier = orderBreakdown(orders);
  for (const [tier, b] of Object.entries(byTier)) {
    const parts = [];
    if (b.paid)    parts.push(`${b.paid} paid`);
    if (b.pending) parts.push(`${b.pending} pending`);
    if (b.used)    parts.push(`${b.used} used`);
    if (b.other)   parts.push(`${b.other} other`);
    console.log(`  ${tier.padEnd(10)} ${String(b.total).padStart(3)} total  (${parts.join(', ') || 'no status'})`);
  }
}

console.log(`\nLocks:     ${fmt(lockKeys.length, 'price lock')}`);

const waitlistKey   = `${P}waitlist:emails`;
const waitlistCount = await client.sCard(waitlistKey);
console.log(`Waitlist:  ${fmt(waitlistCount, 'email')}`);

// ── Confirmation ──────────────────────────────────────────────────────────────
if (!dryRun) {
  const hasYes = flag('--yes');
  if (!hasYes && process.stdin.isTTY) {
    process.stdout.write('\n  Proceed? [y/N] ');
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
    console.log('\n  Pass --yes to confirm in non-interactive mode, or add --dry-run to preview.\n');
    await client.disconnect();
    process.exit(1);
  }
}

// ── Apply resets ──────────────────────────────────────────────────────────────
console.log('\nChanges:');

if (doCounts) {
  if (dryRun) {
    console.log('  mint counts: would reset genesis, core, supporter → 0');
  } else {
    await client.mSet([
      MINT_KEYS[0], '0',
      MINT_KEYS[1], '0',
      MINT_KEYS[2], '0',
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
    console.log(`  waitlist:emails: would clear ${fmt(waitlistCount, 'email')}`);
  } else {
    await client.del(waitlistKey);
    console.log(`  waitlist:emails: cleared ${fmt(waitlistCount, 'email')}`);
  }
}

console.log(`\n${dryRun ? 'Dry run complete — nothing was changed.' : 'Reset complete.'}\n`);

await client.disconnect();
