import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let workers = [];
let loadStats = {
  running: false,
  config: null,
  startedAt: null,
  stats: {
    opsCompleted: 0,
    opsPerSec: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    errors: 0,
  },
};

let safetyTimeout = null;
let statsAggregationInterval = null;
let workerStatsMap = new Map();
const SAFETY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function getLoadStats() {
  return { ...loadStats };
}

export async function startLoad(config, uri) {
  if (loadStats.running) {
    await stopAllWorkers();
  }

  const {
    threads = 16,
    targetOpsPerSec = 1000,
    pattern = 'random',
    operation = 'read',
    readPercent = 80,
    collection = 'test_small',
    maxId = 500000,
    batchSize = 1,
  } = config;

  const opsPerThread = Math.ceil(targetOpsPerSec / threads);

  loadStats = {
    running: true,
    config,
    startedAt: Date.now(),
    stats: { opsCompleted: 0, opsPerSec: 0, avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0, errors: 0 },
  };
  workerStatsMap.clear();

  for (let i = 0; i < threads; i++) {
    const worker = new Worker(join(__dirname, '..', 'workers', 'loadWorker.js'), {
      workerData: {
        uri,
        database: 'ram_pool_demo',
        collection,
        operation,
        readPercent,
        pattern,
        targetOpsPerSec: opsPerThread,
        batchSize,
        maxId,
        workerId: i,
      },
    });

    worker.on('message', (msg) => {
      if (msg.type === 'stats') {
        workerStatsMap.set(msg.workerId, msg.stats);
      }
    });

    worker.on('error', (err) => {
      console.error(`Worker ${i} error:`, err.message, err.stack);
    });

    worker.on('exit', (code) => {
      workers = workers.filter(w => w !== worker);
      workerStatsMap.delete(i);
      if (workers.length === 0) {
        loadStats.running = false;
      }
    });

    workers.push(worker);
  }

  // Aggregate stats every second
  statsAggregationInterval = setInterval(() => {
    if (workerStatsMap.size === 0) return;

    let totalOps = 0;
    let totalOpsPerSec = 0;
    let totalErrors = 0;
    let allLatencies = [];

    for (const stats of workerStatsMap.values()) {
      totalOps += stats.opsCompleted;
      totalOpsPerSec += stats.opsPerSec;
      totalErrors += stats.errors;
      if (stats.latencies) {
        allLatencies = allLatencies.concat(stats.latencies);
      }
    }

    allLatencies.sort((a, b) => a - b);
    const len = allLatencies.length;

    loadStats.stats = {
      opsCompleted: totalOps,
      opsPerSec: Math.round(totalOpsPerSec),
      avgLatencyMs: len > 0 ? +(allLatencies.reduce((s, v) => s + v, 0) / len).toFixed(2) : 0,
      p50LatencyMs: len > 0 ? +allLatencies[Math.floor(len * 0.5)].toFixed(2) : 0,
      p95LatencyMs: len > 0 ? +allLatencies[Math.floor(len * 0.95)].toFixed(2) : 0,
      p99LatencyMs: len > 0 ? +allLatencies[Math.min(Math.floor(len * 0.99), len - 1)].toFixed(2) : 0,
      errors: totalErrors,
    };
  }, 1000);

  // Safety timeout — stop after 5 minutes
  safetyTimeout = setTimeout(async () => {
    console.log('Safety timeout reached — stopping load generator');
    await stopAllWorkers();
  }, SAFETY_TIMEOUT_MS);

  console.log(`Load started: ${threads} threads, targetOps=${targetOpsPerSec} (${targetOpsPerSec === 0 ? 'uncapped' : opsPerThread + '/thread'}), pattern=${pattern}, op=${operation}, collection=${collection}`);
  return { threads, targetOpsPerSec: targetOpsPerSec === 0 ? 0 : opsPerThread * threads };
}

export async function stopAllWorkers() {
  if (safetyTimeout) {
    clearTimeout(safetyTimeout);
    safetyTimeout = null;
  }
  if (statsAggregationInterval) {
    clearInterval(statsAggregationInterval);
    statsAggregationInterval = null;
  }

  const terminationPromises = workers.map(w => {
    return new Promise(resolve => {
      w.on('exit', resolve);
      w.postMessage({ type: 'stop' });
      // Force terminate after 2 seconds
      setTimeout(() => {
        try { w.terminate(); } catch (e) { /* ignore */ }
        resolve();
      }, 2000);
    });
  });

  await Promise.all(terminationPromises);
  workers = [];
  workerStatsMap.clear();
  loadStats.running = false;
}
