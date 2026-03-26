import { MongoClient } from 'mongodb';

let client = null;
let connectionUri = null;

export function getClient() {
  return client;
}

export function getUri() {
  return connectionUri;
}

export async function connectToMongo(uri) {
  if (client) {
    await disconnectFromMongo();
  }

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  await client.db('admin').command({ ping: 1 });
  connectionUri = uri;
  return client;
}

export async function disconnectFromMongo() {
  if (client) {
    try {
      await client.close();
    } catch (e) {
      // ignore close errors
    }
    client = null;
    connectionUri = null;
  }
}
