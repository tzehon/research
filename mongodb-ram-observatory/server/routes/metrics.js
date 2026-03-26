import { Router } from 'express';
import { addSSEClient, startMetricsPolling, getLatestMetrics, clearHistory } from '../services/metricsPoller.js';
import { getClient } from '../services/mongoClient.js';

const router = Router();

// SSE stream for live metrics
router.get('/stream', (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(400).json({ error: 'Not connected to MongoDB' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(':ok\n\n');

  startMetricsPolling();
  addSSEClient(res);
});

// One-shot metrics fetch
router.get('/current', async (req, res) => {
  const latest = getLatestMetrics();
  if (latest) {
    return res.json(latest);
  }

  const client = getClient();
  if (!client) {
    return res.status(400).json({ error: 'Not connected to MongoDB' });
  }

  try {
    const status = await client.db('admin').command({ serverStatus: 1 });
    const cache = status.wiredTiger?.cache || {};
    res.json({
      cache: {
        maxBytes: cache['maximum bytes configured'] || 0,
        usedBytes: cache['bytes currently in the cache'] || 0,
        dirtyBytes: cache['tracked dirty bytes in the cache'] || 0,
      },
      connections: {
        current: status.connections?.current || 0,
        available: status.connections?.available || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: dump all eviction-related cache fields
router.get('/debug/eviction', async (req, res) => {
  const client = getClient();
  if (!client) return res.status(400).json({ error: 'Not connected' });
  try {
    const status = await client.db('admin').command({ serverStatus: 1 });
    const cache = status.wiredTiger?.cache || {};
    const evictionFields = {};
    for (const [key, value] of Object.entries(cache)) {
      if (key.toLowerCase().includes('evict') || key.toLowerCase().includes('application')) {
        evictionFields[key] = value;
      }
    }
    res.json(evictionFields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear metrics history
router.post('/clear', (req, res) => {
  clearHistory();
  res.json({ status: 'cleared' });
});

export default router;
