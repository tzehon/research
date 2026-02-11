import { Router } from 'express';
import queryAnalyzer from '../services/queryAnalyzer.js';
import { validateNamespace, validateSamplingConfig } from '../utils/validators.js';

const router = Router();

/**
 * POST /api/sampling/start
 * Start query sampling for a collection
 */
router.post('/start', async (req, res) => {
  try {
    const { database, collection, samplesPerSecond = 10 } = req.body;

    // Validate namespace
    const nsValidation = validateNamespace(database, collection);
    if (!nsValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid namespace',
        details: nsValidation.errors
      });
    }

    // Validate config
    const configValidation = validateSamplingConfig({ samplesPerSecond });
    if (!configValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid configuration',
        details: configValidation.errors
      });
    }

    const result = await queryAnalyzer.startSampling(database, collection, samplesPerSecond);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sampling/stop
 * Stop query sampling
 */
router.post('/stop', async (req, res) => {
  try {
    const { database, collection } = req.body;

    const result = await queryAnalyzer.stopSampling(database, collection);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sampling/update-rate
 * Update the sampling rate
 */
router.post('/update-rate', async (req, res) => {
  try {
    const { samplesPerSecond } = req.body;

    // Validate
    const configValidation = validateSamplingConfig({ samplesPerSecond });
    if (!configValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid configuration',
        details: configValidation.errors
      });
    }

    const result = await queryAnalyzer.updateSamplingRate(samplesPerSecond);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sampling/status
 * Get current sampling status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await queryAnalyzer.getSamplingStatus();

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sampling/queries
 * List sampled queries
 */
router.get('/queries', async (req, res) => {
  try {
    const { database, collection, limit = '100', skip = '0' } = req.query;

    if (!database || !collection) {
      return res.status(400).json({
        error: 'Database and collection are required'
      });
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedSkip = parseInt(skip, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0 || isNaN(parsedSkip) || parsedSkip < 0) {
      return res.status(400).json({
        error: 'limit and skip must be non-negative integers'
      });
    }

    const result = await queryAnalyzer.listSampledQueries(
      database,
      collection,
      { limit: parsedLimit, skip: parsedSkip }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sampling/stats
 * Get sampled queries statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { database, collection } = req.query;

    if (!database || !collection) {
      return res.status(400).json({
        error: 'Database and collection are required'
      });
    }

    const stats = await queryAnalyzer.getSampledQueriesStats(database, collection);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/sampling/queries
 * Clear sampled queries
 */
router.delete('/queries', async (req, res) => {
  try {
    const { database, collection } = req.query;

    if (!database || !collection) {
      return res.status(400).json({
        error: 'Database and collection are required'
      });
    }

    const result = await queryAnalyzer.clearSampledQueries(database, collection);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
