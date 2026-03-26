import { parentPort, workerData } from 'worker_threads';
import { MongoClient } from 'mongodb';

const {
  uri,
  database,
  collection: collName,
  operation,
  readPercent,
  pattern,
  targetOpsPerSec,
  maxId,
  workerId,
  batchSize: configBatchSize,
} = workerData;

const WRITE_BATCH_SIZE = configBatchSize || 1;

let running = true;
let client;

// Concurrency per worker thread — each worker runs this many ops in parallel
const PIPELINE_DEPTH = 16;

parentPort.on('message', (msg) => {
  if (msg.type === 'stop') {
    running = false;
  }
});

function getSkewedId(max) {
  if (Math.random() < 0.8) {
    return Math.floor(Math.random() * (max * 0.2));
  }
  return Math.floor(Math.random() * max);
}

function getRandomId(max) {
  return Math.floor(Math.random() * max);
}

let sequentialCounter = 0;
function getSequentialId(max) {
  sequentialCounter = (sequentialCounter + 1) % max;
  return sequentialCounter;
}

function getId(max) {
  switch (pattern) {
    case 'skewed': return getSkewedId(max);
    case 'sequential': return getSequentialId(max);
    default: return getRandomId(max);
  }
}

function shouldRead() {
  if (operation === 'read') return true;
  if (operation === 'write') return false;
  return Math.random() * 100 < readPercent;
}

const categories = ['electronics', 'clothing', 'food', 'sports', 'books', 'home', 'garden', 'auto', 'health', 'toys', 'music', 'movies', 'games', 'office', 'pet', 'beauty', 'baby', 'tools', 'outdoor', 'travel'];
const regions = ['US-East', 'US-West', 'EU-West', 'EU-East', 'AP-South', 'AP-East'];

function generateDoc(id) {
  return {
    recordId: id,
    userId: Math.floor(Math.random() * 10000),
    timestamp: new Date(Date.now() - Math.floor(Math.random() * 180 * 24 * 60 * 60 * 1000)),
    category: categories[Math.floor(Math.random() * categories.length)],
    amount: +(Math.random() * 1000).toFixed(2),
    description: Array.from({ length: 20 }, () => Math.random().toString(36).substring(2, 12)).join(' ').substring(0, 200),
    metadata: {
      source: 'demo-load',
      region: regions[Math.floor(Math.random() * regions.length)],
      tags: Array.from({ length: 3 }, () => Math.random().toString(36).substring(2, 8)),
    },
  };
}

async function run() {
  try {
    client = new MongoClient(uri, { maxPoolSize: PIPELINE_DEPTH });
    await client.connect();
    const coll = client.db(database).collection(collName);

    let opsCompleted = 0;
    let errors = 0;
    let latencies = [];
    let windowStart = Date.now();
    let opsThisWindow = 0;

    const uncapped = !targetOpsPerSec || targetOpsPerSec <= 0;
    const intervalMs = uncapped ? 0 : 1000 / targetOpsPerSec;

    // Single op execution
    async function executeOp() {
      const opStart = performance.now();
      try {
        if (shouldRead()) {
          const id = getId(maxId);
          await coll.findOne({ recordId: id });
          opsCompleted++;
          opsThisWindow++;
        } else if (WRITE_BATCH_SIZE > 1) {
          const docs = [];
          for (let b = 0; b < WRITE_BATCH_SIZE; b++) {
            const id = maxId + Math.floor(Math.random() * 10000000);
            docs.push(generateDoc(id));
          }
          await coll.insertMany(docs, { ordered: false });
          opsCompleted += WRITE_BATCH_SIZE;
          opsThisWindow += WRITE_BATCH_SIZE;
        } else {
          const id = maxId + Math.floor(Math.random() * 10000000);
          await coll.insertOne(generateDoc(id));
          opsCompleted++;
          opsThisWindow++;
        }
      } catch (err) {
        errors++;
      }
      const opDuration = performance.now() - opStart;
      latencies.push(opDuration);
    }

    // Stats reporter runs on interval
    const statsInterval = setInterval(() => {
      const recentLatencies = latencies.slice(-Math.max(opsThisWindow, 1));
      parentPort.postMessage({
        type: 'stats',
        workerId,
        stats: {
          opsCompleted,
          opsPerSec: opsThisWindow,
          errors,
          latencies: recentLatencies,
        },
      });
      opsThisWindow = 0;
      windowStart = Date.now();
      latencies = [];
    }, 1000);

    if (uncapped) {
      // Run PIPELINE_DEPTH concurrent op loops for maximum throughput
      const pipelines = Array.from({ length: PIPELINE_DEPTH }, async () => {
        while (running) {
          await executeOp();
        }
      });
      await Promise.all(pipelines);
    } else {
      // Rate-limited serial mode
      while (running) {
        const opStart = performance.now();
        await executeOp();
        const elapsed = performance.now() - opStart;
        const sleepMs = intervalMs - elapsed;
        if (sleepMs > 1) {
          await new Promise(r => setTimeout(r, sleepMs));
        }
      }
    }

    clearInterval(statsInterval);
  } catch (err) {
    parentPort.postMessage({ type: 'error', workerId, error: err.message });
  } finally {
    if (client) {
      try { await client.close(); } catch (e) { /* ignore */ }
    }
    process.exit(0);
  }
}

run();
