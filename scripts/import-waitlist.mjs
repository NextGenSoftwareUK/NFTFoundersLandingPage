// Usage: node scripts/import-waitlist.mjs /path/to/waitlist.txt
// Imports all emails from a text file (one per line) into Redis waitlist:emails set.

import { createClient } from 'redis';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/import-waitlist.mjs <path-to-emails.txt>');
  process.exit(1);
}

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('REDIS_URL env var is required');
  process.exit(1);
}

const emails = readFileSync(resolve(filePath), 'utf8')
  .split('\n')
  .map(line => line.trim().toLowerCase())
  .filter(line => line.includes('@'));

if (!emails.length) {
  console.error('No valid emails found in file');
  process.exit(1);
}

console.log(`Found ${emails.length} emails, importing to Redis...`);

const client = createClient({ url: REDIS_URL });
client.on('error', err => console.error('Redis error:', err));
await client.connect();

const added = await client.sAdd('waitlist:emails', emails);
const total = await client.sCard('waitlist:emails');

console.log(`Done. ${added} new emails added. Total in set: ${total}`);
emails.forEach(e => console.log(' ', e));

await client.disconnect();
