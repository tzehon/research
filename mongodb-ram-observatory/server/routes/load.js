import { Router } from 'express';
import { startLoad, stopAllWorkers, getLoadStats } from '../services/loadGenerator.js';
import { getClient, getUri } from '../services/mongoClient.js';

const router = Router();

router.post('/start', async (req, res) => {
  const client = getClient();
  const uri = getUri();
  if (!client || !uri) {
    return res.status(400).json({ error: 'Not connected to MongoDB' });
  }

  try {
    const result = await startLoad(req.body, uri);
    res.json({ status: 'started', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await stopAllWorkers();
    res.json({ status: 'stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  res.json(getLoadStats());
});

export default router;
