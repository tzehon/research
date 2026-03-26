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
    const adminDb = client.db('admin');
    const dbs = await adminDb.command({ listDatabases: 1, nameOnly: true });
    const found = dbs.databases.some(d => d.name === 'ram_pool_demo');

    if (found) {
      console.log('WARNING: ram_pool_demo database still exists! Run `npm run cleanup` to remove it.');
      process.exit(1);
    } else {
      console.log('ram_pool_demo database does not exist — cleanup confirmed.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
