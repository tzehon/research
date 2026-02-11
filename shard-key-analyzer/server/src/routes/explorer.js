import { Router } from 'express';
import atlasConnection from '../services/atlasConnection.js';
import recommendations from '../services/recommendations.js';

const router = Router();

/**
 * GET /api/explorer/databases
 * List all databases
 */
router.get('/databases', async (req, res) => {
  try {
    const client = atlasConnection.getClient();
    const adminDb = client.db('admin');

    const result = await adminDb.command({ listDatabases: 1 });

    const databases = result.databases
      .filter(db => !['admin', 'local', 'config'].includes(db.name))
      .map(db => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty
      }));

    res.json({ databases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/collections/:database
 * List collections in a database
 */
router.get('/collections/:database', async (req, res) => {
  try {
    const { database } = req.params;
    const client = atlasConnection.getClient();
    const db = client.db(database);

    const collections = await db.listCollections().toArray();

    // Get additional info for each collection
    const collectionInfo = await Promise.all(
      collections.map(async (coll) => {
        try {
          const stats = await db.command({ collStats: coll.name });
          const shardInfo = await atlasConnection.isCollectionSharded(database, coll.name);

          return {
            name: coll.name,
            type: coll.type,
            options: coll.options,
            count: stats.count || 0,
            size: stats.size || 0,
            avgObjSize: stats.avgObjSize || 0,
            storageSize: stats.storageSize || 0,
            totalIndexSize: stats.totalIndexSize || 0,
            nindexes: stats.nindexes || 0,
            ...shardInfo
          };
        } catch (e) {
          return {
            name: coll.name,
            type: coll.type,
            error: e.message
          };
        }
      })
    );

    res.json({ collections: collectionInfo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/schema/:database/:collection
 * Get collection schema by sampling documents
 */
router.get('/schema/:database/:collection', async (req, res) => {
  try {
    const { database, collection } = req.params;
    const { sampleSize = '100' } = req.query;

    const parsedSampleSize = parseInt(sampleSize, 10);
    if (isNaN(parsedSampleSize) || parsedSampleSize < 1 || parsedSampleSize > 10000) {
      return res.status(400).json({
        error: 'sampleSize must be an integer between 1 and 10000'
      });
    }

    const client = atlasConnection.getClient();
    const db = client.db(database);
    const coll = db.collection(collection);

    // Sample documents
    const samples = await coll.aggregate([
      { $sample: { size: parsedSampleSize } }
    ]).toArray();

    if (samples.length === 0) {
      return res.json({
        schema: {},
        sampleCount: 0,
        message: 'No documents found in collection'
      });
    }

    // Analyze schema
    const schema = analyzeSchema(samples);

    res.json({
      schema,
      sampleCount: samples.length,
      sampleDocument: samples[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/stats/:database/:collection
 * Get collection statistics
 */
router.get('/stats/:database/:collection', async (req, res) => {
  try {
    const { database, collection } = req.params;
    const client = atlasConnection.getClient();
    const db = client.db(database);

    const stats = await db.command({ collStats: collection });
    const shardInfo = await atlasConnection.isCollectionSharded(database, collection);

    res.json({
      count: stats.count,
      size: stats.size,
      avgObjSize: stats.avgObjSize,
      storageSize: stats.storageSize,
      totalIndexSize: stats.totalIndexSize,
      nindexes: stats.nindexes,
      capped: stats.capped,
      ...shardInfo,
      raw: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/indexes/:database/:collection
 * Get collection indexes
 */
router.get('/indexes/:database/:collection', async (req, res) => {
  try {
    const { database, collection } = req.params;
    const client = atlasConnection.getClient();
    const db = client.db(database);
    const coll = db.collection(collection);

    const indexes = await coll.indexes();

    res.json({
      indexes: indexes.map(idx => ({
        name: idx.name,
        key: idx.key,
        unique: idx.unique || false,
        sparse: idx.sparse || false,
        background: idx.background || false,
        v: idx.v
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/field-analysis/:database/:collection
 * Analyze fields for shard key candidates
 */
router.get('/field-analysis/:database/:collection', async (req, res) => {
  try {
    const { database, collection } = req.params;

    const result = await recommendations.generateCandidateRecommendations(database, collection);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Analyze schema from sample documents
 */
function analyzeSchema(samples) {
  const schema = {};

  for (const doc of samples) {
    analyzeDocument(doc, schema, '');
  }

  // Convert to array format with statistics
  return Object.entries(schema).map(([path, info]) => ({
    path,
    types: Array.from(info.types),
    count: info.count,
    percentage: ((info.count / samples.length) * 100).toFixed(1),
    sampleValues: info.sampleValues.slice(0, 3)
  }));
}

/**
 * Recursively analyze document structure
 */
function analyzeDocument(obj, schema, prefix, depth = 0) {
  if (depth > 5) return;

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (!schema[path]) {
      schema[path] = {
        types: new Set(),
        count: 0,
        sampleValues: []
      };
    }

    const info = schema[path];
    info.count++;

    const type = getType(value);
    info.types.add(type);

    // Store sample values (non-object)
    if (type !== 'object' && type !== 'array' && info.sampleValues.length < 5) {
      const strValue = formatValue(value);
      if (!info.sampleValues.includes(strValue)) {
        info.sampleValues.push(strValue);
      }
    }

    // Recurse into objects
    if (type === 'object' && value !== null) {
      analyzeDocument(value, schema, path, depth + 1);
    }

    // Analyze first element of arrays
    if (type === 'array' && value.length > 0 && typeof value[0] === 'object') {
      analyzeDocument(value[0], schema, `${path}[]`, depth + 1);
    }
  }
}

/**
 * Get type name for a value
 */
function getType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';

  // Check for BSON types
  if (value._bsontype) {
    return value._bsontype;
  }

  // Check for ObjectId-like
  if (value.toString && value.toString().match(/^[0-9a-fA-F]{24}$/)) {
    return 'ObjectId';
  }

  return typeof value;
}

/**
 * Format value for display
 */
function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') {
      return `ObjectId("${value.toString()}")`;
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string' && value.length > 50) {
    return value.substring(0, 47) + '...';
  }
  return String(value);
}

export default router;
