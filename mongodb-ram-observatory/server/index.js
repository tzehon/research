import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import metricsRouter from './routes/metrics.js';
import loadRouter from './routes/load.js';
import clusterRouter from './routes/cluster.js';
import sizingRouter from './routes/sizing.js';
import { getClient, connectToMongo, disconnectFromMongo } from './services/mongoClient.js';
import { stopMetricsPolling } from './services/metricsPoller.js';
import { stopAllWorkers } from './services/loadGenerator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/metrics', metricsRouter);
app.use('/api/load', loadRouter);
app.use('/api/cluster', clusterRouter);
app.use('/api/sizing', sizingRouter);

// Connection management
app.post('/api/connect', async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri) {
      return res.status(400).json({ error: 'Connection string is required' });
    }
    await connectToMongo(uri);
    res.json({ status: 'connected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    stopMetricsPolling();
    await stopAllWorkers();
    await disconnectFromMongo();
    res.json({ status: 'disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  const client = getClient();
  res.json({
    connected: !!client,
    hasEnvUri: !!process.env.MONGODB_URI,
  });
});

// Auto-connect using .env URI
app.post('/api/connect/env', async (req, res) => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      return res.status(400).json({ error: 'MONGODB_URI not set in .env' });
    }
    await connectToMongo(uri);
    res.json({ status: 'connected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cleanup endpoint
app.post('/api/cleanup', async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.status(400).json({ error: 'Not connected to MongoDB' });
    }
    await stopAllWorkers();
    const db = client.db('ram_pool_demo');
    await db.dropDatabase();
    res.json({ status: 'cleaned', message: 'ram_pool_demo database dropped successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files in production
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MongoDB RAM Pool Observatory running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  stopMetricsPolling();
  await stopAllWorkers();
  await disconnectFromMongo();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopMetricsPolling();
  await stopAllWorkers();
  await disconnectFromMongo();
  process.exit(0);
});
