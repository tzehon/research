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
    console.log('Dropping ram_pool_demo database...');
    await client.db('ram_pool_demo').dropDatabase();
    console.log('ram_pool_demo database dropped successfully.');
    console.log('\nRun `npm run verify-cleanup` to confirm.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
