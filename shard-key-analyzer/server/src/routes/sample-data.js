import { Router } from 'express';
import atlasConnection from '../services/atlasConnection.js';
import { generateEcommerceData } from '../../examples/datasets/ecommerce.js';
import { generateSocialData } from '../../examples/datasets/social.js';

const router = Router();

// Store loading state
let loadingState = {
  isLoading: false,
  progress: 0,
  total: 0,
  dataset: null,
  error: null
};

/**
 * GET /api/sample-data/datasets
 * Get available sample datasets
 */
router.get('/datasets', (req, res) => {
  res.json({
    datasets: [
      {
        id: 'ecommerce',
        name: 'E-commerce Orders',
        description: 'Simulated e-commerce order data with customers, products, and regions',
        defaultCount: 150000,
        fields: [
          { name: 'orderId', type: 'UUID', cardinality: 'unique' },
          { name: 'customerId', type: 'UUID', cardinality: 'high' },
          { name: 'region', type: 'String', cardinality: 'low (4 values)' },
          { name: 'country', type: 'String', cardinality: 'medium (~50 values)' },
          { name: 'status', type: 'String', cardinality: 'very low (5 values)' },
          { name: 'createdAt', type: 'Date', cardinality: 'high (monotonic!)' }
        ],
        goodCandidates: ['customerId', 'orderId', '{ customerId, createdAt }'],
        badCandidates: ['region', 'status', 'createdAt']
      },
      {
        id: 'social',
        name: 'Social Media Posts',
        description: 'Simulated social media posts with users, engagement metrics',
        defaultCount: 100000,
        fields: [
          { name: 'postId', type: 'UUID', cardinality: 'unique' },
          { name: 'userId', type: 'UUID', cardinality: 'high' },
          { name: 'category', type: 'String', cardinality: 'low (10 values)' },
          { name: 'visibility', type: 'String', cardinality: 'very low (3 values)' },
          { name: 'createdAt', type: 'Date', cardinality: 'high (monotonic!)' }
        ],
        goodCandidates: ['userId', 'postId', '{ userId, createdAt }'],
        badCandidates: ['category', 'visibility', 'createdAt']
      }
    ]
  });
});

/**
 * POST /api/sample-data/load
 * Load sample data into collection
 */
router.post('/load', async (req, res) => {
  try {
    const {
      dataset = 'ecommerce',
      database,
      collection,
      count = 150000,
      dropExisting = false
    } = req.body;

    if (!database || !collection) {
      return res.status(400).json({
        error: 'Database and collection are required'
      });
    }

    if (loadingState.isLoading) {
      return res.status(409).json({
        error: 'Data loading is already in progress',
        progress: loadingState.progress,
        total: loadingState.total
      });
    }

    const client = atlasConnection.getClient();
    const db = client.db(database);
    const coll = db.collection(collection);

    // Check if collection already has data
    const existingCount = await coll.countDocuments({}, { limit: 1 });
    if (existingCount > 0 && !dropExisting) {
      return res.status(409).json({
        error: `Collection ${database}.${collection} already has data. Drop it first or choose a different collection.`
      });
    }

    // Drop existing if requested
    if (dropExisting) {
      try {
        await coll.drop();
      } catch (e) {
        // Collection might not exist
      }
    }

    // Initialize loading state
    loadingState = {
      isLoading: true,
      progress: 0,
      total: count,
      dataset,
      error: null
    };

    // Start loading in background
    loadDataInBackground(dataset, coll, count)
      .then(() => {
        loadingState.isLoading = false;
      })
      .catch((error) => {
        loadingState.isLoading = false;
        loadingState.error = error.message;
      });

    res.json({
      success: true,
      message: 'Data loading started',
      dataset,
      count
    });
  } catch (error) {
    loadingState.isLoading = false;
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sample-data/status
 * Get data loading status
 */
router.get('/status', (req, res) => {
  res.json(loadingState);
});

/**
 * POST /api/sample-data/stop
 * Stop data loading
 */
router.post('/stop', (req, res) => {
  loadingState.isLoading = false;
  res.json({ success: true, message: 'Loading stopped' });
});

/**
 * Load data in background with progress tracking
 */
async function loadDataInBackground(dataset, coll, count) {
  const batchSize = 1000;
  let inserted = 0;

  const generator = dataset === 'social' ? generateSocialData : generateEcommerceData;

  while (inserted < count && loadingState.isLoading) {
    const remaining = count - inserted;
    const currentBatch = Math.min(batchSize, remaining);

    const documents = generator(currentBatch, inserted);

    await coll.insertMany(documents);

    inserted += currentBatch;
    loadingState.progress = inserted;

    // Small delay to allow progress polling
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Create indexes for common shard key candidates
  if (dataset === 'ecommerce') {
    await coll.createIndex({ customerId: 1 });
    await coll.createIndex({ orderId: 1 }, { unique: true });
    await coll.createIndex({ region: 1 });
    await coll.createIndex({ customerId: 1, createdAt: 1 });
    await coll.createIndex({ region: 1, customerId: 1 });
  } else if (dataset === 'social') {
    await coll.createIndex({ userId: 1 });
    await coll.createIndex({ postId: 1 }, { unique: true });
    await coll.createIndex({ userId: 1, createdAt: 1 });
  }

}

export default router;
