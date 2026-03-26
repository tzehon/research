import { getClient } from './mongoClient.js';

let pollingInterval = null;
let sseClients = [];
let previousStatus = null;
let previousTimestamp = null;
let metricsHistory = [];
const MAX_HISTORY = 300; // 5 minutes at 1/s

export function addSSEClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
  // Send current history immediately
  if (metricsHistory.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'history', data: metricsHistory })}\n\n`);
  }
}

export function getLatestMetrics() {
  if (metricsHistory.length === 0) return null;
  return metricsHistory[metricsHistory.length - 1];
}

function computeRate(current, previous, deltaSec) {
  if (previous === undefined || previous === null || deltaSec <= 0) return 0;
  return Math.max(0, (current - previous) / deltaSec);
}

function parseMetrics(status, prevStatus, deltaSec) {
  const wt = status.wiredTiger || {};
  const cache = wt.cache || {};
  const conc = wt.concurrentTransactions || {};
  const conn = status.connections || {};
  const ops = status.opcounters || {};
  const gl = status.globalLock || {};

  const cacheMax = cache['maximum bytes configured'] || 0;
  const cacheUsed = cache['bytes currently in the cache'] || 0;
  const cacheDirty = cache['tracked dirty bytes in the cache'] || 0;

  const prevCache = prevStatus?.wiredTiger?.cache || {};
  const prevOps = prevStatus?.opcounters || {};

  const metrics = {
    timestamp: Date.now(),
    cache: {
      maxBytes: cacheMax,
      usedBytes: cacheUsed,
      dirtyBytes: cacheDirty,
      usedPercent: cacheMax > 0 ? (cacheUsed / cacheMax) * 100 : 0,
      dirtyPercent: cacheMax > 0 ? (cacheDirty / cacheMax) * 100 : 0,
      pagesReadRate: computeRate(
        cache['pages read into cache'] || 0,
        prevCache['pages read into cache'],
        deltaSec
      ),
      bytesReadRate: computeRate(
        cache['bytes read into cache'] || 0,
        prevCache['bytes read into cache'],
        deltaSec
      ),
      bytesWrittenRate: computeRate(
        cache['bytes written from cache'] || 0,
        prevCache['bytes written from cache'],
        deltaSec
      ),
      pagesEvictedApp: computeRate(
        cache['pages evicted by application threads'] || 0,
        prevCache['pages evicted by application threads'],
        deltaSec
      ),
      pagesEvictedTotal: computeRate(
        (cache['internal pages evicted'] || 0) + (cache['modified pages evicted'] || 0) + (cache['unmodified pages evicted'] || 0),
        prevCache ? ((prevCache['internal pages evicted'] || 0) + (prevCache['modified pages evicted'] || 0) + (prevCache['unmodified pages evicted'] || 0)) : undefined,
        deltaSec
      ),
    },
    connections: {
      current: conn.current || 0,
      available: conn.available || 0,
      total: (conn.current || 0) + (conn.available || 0),
    },
    operations: {
      queryRate: computeRate(ops.query || 0, prevOps?.query, deltaSec),
      insertRate: computeRate(ops.insert || 0, prevOps?.insert, deltaSec),
      updateRate: computeRate(ops.update || 0, prevOps?.update, deltaSec),
      deleteRate: computeRate(ops.delete || 0, prevOps?.delete, deltaSec),
      totalRate: computeRate(
        (ops.query || 0) + (ops.insert || 0) + (ops.update || 0) + (ops.delete || 0),
        prevOps ? ((prevOps.query || 0) + (prevOps.insert || 0) + (prevOps.update || 0) + (prevOps.delete || 0)) : undefined,
        deltaSec
      ),
    },
    tickets: {
      readAvailable: conc.read?.available ?? 128,
      readTotal: conc.read?.totalTickets ?? 128,
      writeAvailable: conc.write?.available ?? 128,
      writeTotal: conc.write?.totalTickets ?? 128,
    },
    activeClients: {
      total: gl.activeClients?.total || 0,
      readers: gl.activeClients?.readers || 0,
      writers: gl.activeClients?.writers || 0,
    },
    queues: {
      readers: gl.currentQueue?.readers || 0,
      writers: gl.currentQueue?.writers || 0,
      total: (gl.currentQueue?.readers || 0) + (gl.currentQueue?.writers || 0),
    },
  };

  return metrics;
}

export function startMetricsPolling() {
  if (pollingInterval) return;

  previousStatus = null;
  previousTimestamp = null;

  pollingInterval = setInterval(async () => {
    const client = getClient();
    if (!client) return;

    try {
      const status = await client.db('admin').command({ serverStatus: 1 });
      const now = Date.now();
      const deltaSec = previousTimestamp ? (now - previousTimestamp) / 1000 : 1;

      const metrics = parseMetrics(status, previousStatus, deltaSec);

      previousStatus = status;
      previousTimestamp = now;

      metricsHistory.push(metrics);
      if (metricsHistory.length > MAX_HISTORY) {
        metricsHistory = metricsHistory.slice(-MAX_HISTORY);
      }

      const message = `data: ${JSON.stringify({ type: 'metrics', data: metrics })}\n\n`;
      sseClients.forEach(c => {
        try { c.write(message); } catch (e) { /* client disconnected */ }
      });
    } catch (err) {
      const errorMsg = `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`;
      sseClients.forEach(c => {
        try { c.write(errorMsg); } catch (e) { /* ignore */ }
      });
    }
  }, 1000);
}

export function stopMetricsPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  previousStatus = null;
  previousTimestamp = null;
  metricsHistory = [];
}

export function clearHistory() {
  metricsHistory = [];
  previousStatus = null;
  previousTimestamp = null;
}
