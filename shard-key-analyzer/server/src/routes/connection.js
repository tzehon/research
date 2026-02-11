import { Router } from 'express';
import atlasConnection from '../services/atlasConnection.js';
import { validateConnectionString } from '../utils/validators.js';

const router = Router();

/**
 * GET /api/connection/status
 * Get current connection status
 */
router.get('/status', (req, res) => {
  try {
    const status = atlasConnection.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/connection/connect
 * Connect to MongoDB Atlas
 */
router.post('/connect', async (req, res) => {
  try {
    const { connectionString, database } = req.body;

    // Validate connection string
    const validation = validateConnectionString(connectionString);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid connection string',
        details: validation.errors
      });
    }

    // Connect to Atlas
    const result = await atlasConnection.connect(connectionString, { database });

    res.json({
      success: true,
      message: 'Connected to MongoDB Atlas',
      ...result
    });
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({
      error: 'Failed to connect',
      message: error.message
    });
  }
});

/**
 * POST /api/connection/disconnect
 * Disconnect from MongoDB
 */
router.post('/disconnect', async (req, res) => {
  try {
    await atlasConnection.disconnect();
    res.json({
      success: true,
      message: 'Disconnected from MongoDB'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/connection/shards
 * List all shards in the cluster
 */
router.get('/shards', async (req, res) => {
  try {
    const shards = await atlasConnection.listShards();
    res.json({ shards });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/connection/verify-permissions
 * Verify user has required permissions
 */
router.post('/verify-permissions', async (req, res) => {
  try {
    const { database, collection } = req.body;

    if (!database || !collection) {
      return res.status(400).json({
        error: 'Database and collection are required'
      });
    }

    const permissions = await atlasConnection.verifyPermissions(database, collection);
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
