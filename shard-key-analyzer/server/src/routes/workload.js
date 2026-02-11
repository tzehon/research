import { Router } from 'express';
import workloadSimulator from '../services/workloadSimulator.js';
import { validateNamespace, validateWorkloadConfig } from '../utils/validators.js';

const router = Router();

/**
 * GET /api/workload/profiles
 * Get available workload profiles
 */
router.get('/profiles', (req, res) => {
  try {
    const profiles = workloadSimulator.getProfiles();
    res.json({ profiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/workload/start
 * Start workload simulation
 */
router.post('/start', async (req, res) => {
  try {
    const {
      database,
      collection,
      profile = 'ecommerce',
      durationSeconds = 120,
      queriesPerSecond = 15,
      customPatterns = null
    } = req.body;

    // Validate namespace
    const nsValidation = validateNamespace(database, collection);
    if (!nsValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid namespace',
        details: nsValidation.errors
      });
    }

    // Validate config
    const configValidation = validateWorkloadConfig({
      profile,
      durationSeconds,
      queriesPerSecond
    });
    if (!configValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid configuration',
        details: configValidation.errors
      });
    }

    // Get Socket.io instance
    const io = req.app.get('io');

    const result = await workloadSimulator.startWorkload(
      database,
      collection,
      {
        profile,
        durationSeconds,
        queriesPerSecond,
        customPatterns
      },
      io
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/workload/stop
 * Stop workload simulation
 */
router.post('/stop', (req, res) => {
  try {
    const result = workloadSimulator.stopWorkload();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/workload/status
 * Get workload simulation status
 */
router.get('/status', (req, res) => {
  try {
    const status = workloadSimulator.getWorkloadStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
