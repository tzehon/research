import { MongoClient } from 'mongodb';

// Store active connection
let client = null;
let connectionInfo = null;

/**
 * Parse and validate MongoDB Atlas connection string
 */
export function parseConnectionString(connectionString) {
  try {
    // Validate it's an Atlas SRV connection string
    if (!connectionString.startsWith('mongodb+srv://')) {
      throw new Error('Connection string must use mongodb+srv:// format for Atlas clusters');
    }

    const url = new URL(connectionString.replace('mongodb+srv://', 'https://'));

    // Extract components
    const username = url.username;
    const password = url.password;
    const host = url.hostname;
    const database = url.pathname.slice(1) || null;
    const options = Object.fromEntries(url.searchParams);

    // Mask the password for display
    const maskedConnectionString = connectionString.replace(
      `:${password}@`,
      ':****@'
    );

    return {
      username,
      host,
      database,
      options,
      maskedConnectionString,
      isValid: true
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }
}

/**
 * Connect to MongoDB Atlas cluster
 */
export async function connect(connectionString, options = {}) {
  // Close existing connection if any
  if (client) {
    await disconnect();
  }

  const parsed = parseConnectionString(connectionString);
  if (!parsed.isValid) {
    throw new Error(parsed.error);
  }

  try {
    client = new MongoClient(connectionString, {
      maxPoolSize: 10,
      minPoolSize: 1,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      ...options
    });

    await client.connect();

    // Verify connection and get cluster info
    const adminDb = client.db('admin');

    // Get server info
    const buildInfo = await adminDb.command({ buildInfo: 1 });
    const version = buildInfo.version;

    // Check MongoDB version >= 7.0
    const [major] = version.split('.').map(Number);
    if (major < 7) {
      await disconnect();
      throw new Error(`MongoDB version ${version} detected. Version 7.0 or higher is required for analyzeShardKey command.`);
    }

    // Check if it's a sharded cluster
    let isSharded = false;
    let shardCount = 0;

    try {
      const configDb = client.db('config');
      const shards = await configDb.collection('shards').find({}).toArray();
      isSharded = shards.length > 0;
      shardCount = shards.length;
    } catch (e) {
      // Not a sharded cluster or no access to config db
    }

    // Get cluster topology
    const serverStatus = await adminDb.command({ serverStatus: 1 });
    const replicaSetName = serverStatus.repl?.setName || null;

    connectionInfo = {
      host: parsed.host,
      maskedConnectionString: parsed.maskedConnectionString,
      version,
      isSharded,
      shardCount,
      replicaSetName,
      connectedAt: new Date().toISOString(),
      defaultDatabase: parsed.database
    };

    return {
      success: true,
      ...connectionInfo
    };

  } catch (error) {
    if (client) {
      await client.close().catch(() => {});
      client = null;
    }
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    connectionInfo = null;
  }
  return { success: true };
}

/**
 * Get current connection status
 */
export function getStatus() {
  if (!client || !connectionInfo) {
    return {
      connected: false
    };
  }

  return {
    connected: true,
    ...connectionInfo
  };
}

/**
 * Get the active MongoDB client
 */
export function getClient() {
  if (!client) {
    throw new Error('Not connected to MongoDB. Please connect first.');
  }
  return client;
}

/**
 * Get a database instance
 */
export function getDatabase(name) {
  const mongoClient = getClient();
  return mongoClient.db(name);
}

/**
 * Verify user has required permissions for analyzeShardKey
 */
export async function verifyPermissions(database, collection) {
  const mongoClient = getClient();
  const db = mongoClient.db(database);

  const permissions = {
    canAnalyzeShardKey: false,
    canConfigureQueryAnalyzer: false,
    canListSampledQueries: false,
    errors: []
  };

  try {
    // Try a minimal analyzeShardKey command to check permission
    // This will fail but tell us if we have permission
    await db.command({
      analyzeShardKey: `${database}.${collection}`,
      key: { _id: 1 },
      keyCharacteristics: true,
      readWriteDistribution: false
    });
    permissions.canAnalyzeShardKey = true;
  } catch (error) {
    if (error.codeName === 'Unauthorized') {
      permissions.errors.push('User lacks permission for analyzeShardKey');
    } else {
      // Command executed but may have failed for other reasons
      permissions.canAnalyzeShardKey = true;
    }
  }

  try {
    // Check configureQueryAnalyzer permission
    const adminDb = mongoClient.db('admin');
    await adminDb.command({
      configureQueryAnalyzer: `${database}.${collection}`,
      mode: 'off'
    });
    permissions.canConfigureQueryAnalyzer = true;
  } catch (error) {
    if (error.codeName === 'Unauthorized') {
      permissions.errors.push('User lacks permission for configureQueryAnalyzer');
    } else {
      permissions.canConfigureQueryAnalyzer = true;
    }
  }

  return permissions;
}

/**
 * List all shards in the cluster
 */
export async function listShards() {
  const mongoClient = getClient();

  try {
    const configDb = mongoClient.db('config');
    const shards = await configDb.collection('shards').find({}).toArray();

    return shards.map(shard => ({
      id: shard._id,
      host: shard.host,
      state: shard.state || 'active'
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Check if a collection is already sharded
 */
export async function isCollectionSharded(database, collection) {
  const mongoClient = getClient();

  try {
    const configDb = mongoClient.db('config');
    const shardedCollection = await configDb.collection('collections').findOne({
      _id: `${database}.${collection}`
    });

    if (shardedCollection) {
      return {
        isSharded: true,
        shardKey: shardedCollection.key,
        unique: shardedCollection.unique || false
      };
    }

    return { isSharded: false };
  } catch (error) {
    return { isSharded: false, error: error.message };
  }
}

export default {
  parseConnectionString,
  connect,
  disconnect,
  getStatus,
  getClient,
  getDatabase,
  verifyPermissions,
  listShards,
  isCollectionSharded
};
