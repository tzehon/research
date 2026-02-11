import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

import connectionRoutes from './routes/connection.js';
import explorerRoutes from './routes/explorer.js';
import samplingRoutes from './routes/sampling.js';
import workloadRoutes from './routes/workload.js';
import analysisRoutes from './routes/analysis.js';
import sampleDataRoutes from './routes/sample-data.js';
import { setupSocketHandlers, stopSamplingStatusUpdates } from './socket/handlers.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? false
      : ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:3000', 'http://localhost:5173']
}));
app.use(express.json());

// Make io available to routes
app.set('io', io);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/connection', connectionRoutes);
app.use('/api/explorer', explorerRoutes);
app.use('/api/sampling', samplingRoutes);
app.use('/api/workload', workloadRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/sample-data', sampleDataRoutes);

// Socket.io handlers
setupSocketHandlers(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🍃 MongoDB Shard Key Analyzer Server                        ║
║                                                               ║
║   Server running on http://localhost:${PORT}                    ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
function shutdown() {
  stopSamplingStatusUpdates();
  io.close();
  httpServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { io };
