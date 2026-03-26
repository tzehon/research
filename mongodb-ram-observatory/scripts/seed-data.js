import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI not set. Copy .env.example to .env and set your connection string.');
  process.exit(1);
}

// Parse --large-count argument
const args = process.argv.slice(2);
let largeCount = 10_000_000;
const countArgIdx = args.indexOf('--large-count');
if (countArgIdx !== -1 && args[countArgIdx + 1]) {
  largeCount = parseInt(args[countArgIdx + 1], 10);
  if (isNaN(largeCount) || largeCount < 0) {
    console.error('Invalid --large-count value');
    process.exit(1);
  }
}

const smallCount = 500_000;
const BATCH_SIZE = 5000;
const DB_NAME = 'ram_pool_demo';

const categories = ['electronics', 'clothing', 'food', 'sports', 'books', 'home', 'garden', 'auto', 'health', 'toys', 'music', 'movies', 'games', 'office', 'pet', 'beauty', 'baby', 'tools', 'outdoor', 'travel'];
const regions = ['US-East', 'US-West', 'EU-West', 'EU-East', 'AP-South', 'AP-East'];

function generateDoc(recordId) {
  return {
    recordId,
    userId: Math.floor(Math.random() * 10000),
    timestamp: new Date(Date.now() - Math.floor(Math.random() * 180 * 24 * 60 * 60 * 1000)),
    category: categories[Math.floor(Math.random() * categories.length)],
    amount: +(Math.random() * 1000).toFixed(2),
    description: Array.from({ length: 20 }, () => Math.random().toString(36).substring(2, 12)).join(' ').substring(0, 200),
    metadata: {
      source: 'demo',
      region: regions[Math.floor(Math.random() * regions.length)],
      tags: Array.from({ length: 3 }, () => Math.random().toString(36).substring(2, 8)),
    },
  };
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

async function seedCollection(db, collName, totalDocs) {
  const coll = db.collection(collName);

  // Check if already seeded
  const existingCount = await coll.countDocuments();
  if (existingCount >= totalDocs) {
    console.log(`  ${collName}: already has ${existingCount.toLocaleString()} docs (target: ${totalDocs.toLocaleString()}) — skipping`);
    return;
  }

  if (existingCount > 0) {
    console.log(`  ${collName}: has ${existingCount.toLocaleString()} docs, need ${totalDocs.toLocaleString()} — resuming from ${existingCount.toLocaleString()}`);
  }

  const startId = existingCount;
  const remaining = totalDocs - existingCount;
  const batches = Math.ceil(remaining / BATCH_SIZE);
  const start = Date.now();
  let inserted = 0;

  for (let b = 0; b < batches; b++) {
    const batchStart = startId + b * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalDocs);
    const docs = [];
    for (let i = batchStart; i < batchEnd; i++) {
      docs.push(generateDoc(i));
    }

    try {
      await coll.insertMany(docs, { ordered: false });
    } catch (err) {
      if (err.code !== 11000) { // ignore duplicate key errors (resume-safe)
        throw err;
      }
    }

    inserted += docs.length;
    const elapsed = Date.now() - start;
    const rate = Math.round(inserted / (elapsed / 1000));
    const eta = remaining > inserted ? formatDuration((remaining - inserted) / rate * 1000) : '0s';
    const pct = ((inserted / remaining) * 100).toFixed(1);

    process.stdout.write(`\r  ${collName}: ${(startId + inserted).toLocaleString()}/${totalDocs.toLocaleString()} docs (${pct}%) — ${rate.toLocaleString()} docs/s — ETA: ${eta}   `);
  }

  const elapsed = Date.now() - start;
  console.log(`\n  ${collName}: seeded ${inserted.toLocaleString()} docs in ${formatDuration(elapsed)}`);
}

async function createIndexes(db, collName) {
  const coll = db.collection(collName);
  console.log(`  Creating indexes on ${collName}...`);
  await coll.createIndex({ recordId: 1 });
  await coll.createIndex({ userId: 1, timestamp: -1 });
  console.log(`  Indexes created on ${collName}`);
}

async function main() {
  console.log('MongoDB RAM Pool Observatory — Seed Data');
  console.log('=========================================');
  console.log(`Target cluster: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);
  console.log(`Small collection: ${smallCount.toLocaleString()} docs`);
  console.log(`Large collection: ${largeCount.toLocaleString()} docs`);
  console.log();

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(DB_NAME);

    // Seed small collection
    console.log('Seeding test_small...');
    await seedCollection(db, 'test_small', smallCount);
    await createIndexes(db, 'test_small');
    console.log();

    // Seed large collection
    if (largeCount > 0) {
      console.log('Seeding test_large...');
      await seedCollection(db, 'test_large', largeCount);
      await createIndexes(db, 'test_large');
    }

    console.log('\nSeed complete! Run `npm run verify-seed` to verify.');
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
