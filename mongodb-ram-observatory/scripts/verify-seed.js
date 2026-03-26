import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI not set.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('ram_pool_demo');

    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('No collections found in ram_pool_demo. Run `npm run seed` first.');
      process.exit(1);
    }

    console.log('ram_pool_demo database verification:');
    console.log('====================================');

    for (const coll of collections) {
      const stats = await db.command({ collStats: coll.name });
      const indexes = await db.collection(coll.name).listIndexes().toArray();
      console.log(`\n  ${coll.name}:`);
      console.log(`    Documents: ${stats.count?.toLocaleString()}`);
      console.log(`    Data size: ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
      console.log(`    Storage size: ${(stats.storageSize / (1024 * 1024)).toFixed(1)} MB`);
      console.log(`    Avg doc size: ${stats.avgObjSize} bytes`);
      console.log(`    Indexes (${indexes.length}): ${indexes.map(i => i.name).join(', ')}`);
    }

    console.log('\nVerification complete.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
