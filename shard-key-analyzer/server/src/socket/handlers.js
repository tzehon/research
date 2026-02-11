import queryAnalyzer from '../services/queryAnalyzer.js';
import workloadSimulator from '../services/workloadSimulator.js';

// Store connected clients
const clients = new Map();

/**
 * Setup Socket.io event handlers
 */
export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    clients.set(socket.id, {
      connectedAt: new Date().toISOString(),
      subscriptions: new Set()
    });

    // Handle subscription to sampling updates
    socket.on('subscribe:sampling', async (data) => {
      const { database, collection } = data;
      const client = clients.get(socket.id);

      if (client) {
        client.subscriptions.add(`sampling:${database}.${collection}`);
        socket.join(`sampling:${database}.${collection}`);

        // Send current status
        try {
          const status = await queryAnalyzer.getSamplingStatus();
          socket.emit('sampling:status', status);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      }
    });

    // Handle unsubscription from sampling updates
    socket.on('unsubscribe:sampling', (data) => {
      const { database, collection } = data;
      const client = clients.get(socket.id);

      if (client) {
        client.subscriptions.delete(`sampling:${database}.${collection}`);
        socket.leave(`sampling:${database}.${collection}`);
      }
    });

    // Handle subscription to workload updates
    socket.on('subscribe:workload', (data) => {
      const { database, collection } = data;
      const client = clients.get(socket.id);

      if (client) {
        client.subscriptions.add(`workload:${database}.${collection}`);
        socket.join(`workload:${database}.${collection}`);

        // Send current status
        const status = workloadSimulator.getWorkloadStatus();
        socket.emit('workload:status', status);
      }
    });

    // Handle unsubscription from workload updates
    socket.on('unsubscribe:workload', (data) => {
      const { database, collection } = data;
      const client = clients.get(socket.id);

      if (client) {
        client.subscriptions.delete(`workload:${database}.${collection}`);
        socket.leave(`workload:${database}.${collection}`);
      }
    });

    // Handle subscription to analysis updates
    socket.on('subscribe:analysis', (data) => {
      const { analysisId } = data;
      const client = clients.get(socket.id);

      if (client) {
        client.subscriptions.add(`analysis:${analysisId}`);
        socket.join(`analysis:${analysisId}`);
      }
    });

    // Handle unsubscription from analysis updates
    socket.on('unsubscribe:analysis', (data) => {
      const { analysisId } = data;
      const client = clients.get(socket.id);

      if (client) {
        client.subscriptions.delete(`analysis:${analysisId}`);
        socket.leave(`analysis:${analysisId}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      clients.delete(socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  // Start periodic status updates
  startSamplingStatusUpdates(io);

  return io;
}

/**
 * Emit sampling progress updates
 */
export function emitSamplingProgress(io, namespace, data) {
  io.to(`sampling:${namespace}`).emit('sampling:progress', data);
}

/**
 * Emit new sampled query notification
 */
export function emitNewSampledQuery(io, namespace, query) {
  io.to(`sampling:${namespace}`).emit('sampling:newQuery', query);
}

/**
 * Emit workload progress updates
 */
export function emitWorkloadProgress(io, namespace, data) {
  io.to(`workload:${namespace}`).emit('workload:progress', data);
}

/**
 * Emit workload completion
 */
export function emitWorkloadComplete(io, namespace, data) {
  io.to(`workload:${namespace}`).emit('workload:complete', data);
}

/**
 * Emit analysis progress updates
 */
export function emitAnalysisProgress(io, analysisId, data) {
  io.to(`analysis:${analysisId}`).emit('analysis:progress', data);
}

/**
 * Emit analysis completion
 */
export function emitAnalysisComplete(io, analysisId, data) {
  io.to(`analysis:${analysisId}`).emit('analysis:complete', data);
}

let samplingStatusInterval = null;

/**
 * Start periodic sampling status updates
 */
function startSamplingStatusUpdates(io) {
  stopSamplingStatusUpdates();
  samplingStatusInterval = setInterval(async () => {
    try {
      const status = await queryAnalyzer.getSamplingStatus();

      if (status.isActive && status.namespace) {
        io.to(`sampling:${status.namespace}`).emit('sampling:status', status);
      }
    } catch (error) {
      // Silently ignore errors (e.g., not connected)
    }
  }, 2000); // Update every 2 seconds
}

/**
 * Stop periodic sampling status updates
 */
export function stopSamplingStatusUpdates() {
  if (samplingStatusInterval) {
    clearInterval(samplingStatusInterval);
    samplingStatusInterval = null;
  }
}

/**
 * Get connected client count
 */
export function getConnectedClientCount() {
  return clients.size;
}

/**
 * Get all connected clients
 */
export function getConnectedClients() {
  return Array.from(clients.entries()).map(([id, data]) => ({
    id,
    ...data,
    subscriptions: Array.from(data.subscriptions)
  }));
}

export default {
  setupSocketHandlers,
  stopSamplingStatusUpdates,
  emitSamplingProgress,
  emitNewSampledQuery,
  emitWorkloadProgress,
  emitWorkloadComplete,
  emitAnalysisProgress,
  emitAnalysisComplete,
  getConnectedClientCount,
  getConnectedClients
};
