import atlasConnection from './atlasConnection.js';
import { v4 as uuidv4 } from 'uuid';

// Workload state
let workloadState = {
  isRunning: false,
  profile: null,
  config: null,
  stats: null,
  startedAt: null,
  abortController: null
};

// Workload profiles
const PROFILES = {
  ecommerce: {
    name: 'E-commerce',
    description: 'Simulates an e-commerce order system with customer-centric reads and writes',
    patterns: [
      {
        name: 'Get customer orders',
        type: 'read',
        weight: 25,
        operation: 'find',
        template: (data) => ({
          filter: { customerId: data.customerId },
          options: { sort: { createdAt: -1 }, limit: 20 }
        })
      },
      {
        name: 'Place new order',
        type: 'write',
        weight: 15,
        operation: 'insert',
        template: (data) => ({
          document: {
            orderId: uuidv4(),
            customerId: data.customerId,
            region: data.region,
            totalAmount: Math.round((Math.random() * 500 + 10) * 100) / 100,
            status: 'pending',
            paymentMethod: ['credit_card', 'debit_card', 'paypal'][Math.floor(Math.random() * 3)],
            lineItems: [{ sku: `SKU-${Math.random().toString(36).substring(2, 10).toUpperCase()}`, quantity: Math.floor(Math.random() * 3) + 1 }],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
      },
      {
        name: 'Get order details',
        type: 'read',
        weight: 10,
        operation: 'find',
        template: (data) => ({
          filter: { orderId: data.orderId }
        })
      },
      {
        name: 'Update order status',
        type: 'write',
        weight: 10,
        operation: 'update',
        template: (data) => ({
          filter: { orderId: data.orderId },
          update: { $set: { status: data.status, updatedAt: new Date() } }
        })
      },
      {
        name: 'Customer updates order',
        type: 'write',
        weight: 15,
        operation: 'update',
        template: (data) => ({
          filter: { customerId: data.customerId, orderId: data.orderId },
          update: { $set: { 'shippingAddress.street': `${Math.floor(Math.random() * 9999) + 1} Updated Street`, updatedAt: new Date() } }
        })
      },
      {
        name: 'Cancel customer order',
        type: 'write',
        weight: 10,
        operation: 'update',
        template: (data) => ({
          filter: { customerId: data.customerId, status: 'pending' },
          update: { $set: { status: 'cancelled', updatedAt: new Date() } }
        })
      },
      {
        name: 'Customer spending summary',
        type: 'read',
        weight: 10,
        operation: 'aggregate',
        template: (data) => ({
          pipeline: [
            { $match: { customerId: data.customerId } },
            { $group: { _id: '$customerId', totalSpent: { $sum: '$totalAmount' }, orderCount: { $sum: 1 } } }
          ]
        })
      },
      {
        name: 'Regional sales report',
        type: 'read',
        weight: 5,
        operation: 'aggregate',
        template: (data) => ({
          pipeline: [
            { $match: { region: data.region, createdAt: { $gte: data.dateFrom } } },
            { $group: { _id: '$region', totalSales: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
          ]
        })
      }
    ]
  },
  social: {
    name: 'Social Media',
    description: 'Simulates a social media platform with user-centric reads and writes',
    patterns: [
      {
        name: 'Get user feed',
        type: 'read',
        weight: 25,
        operation: 'find',
        template: (data) => ({
          filter: { userId: data.userId },
          options: { sort: { createdAt: -1 }, limit: 20 }
        })
      },
      {
        name: 'Create new post',
        type: 'write',
        weight: 15,
        operation: 'insert',
        template: (data) => ({
          document: {
            postId: uuidv4(),
            userId: data.userId,
            username: `user_${data.userId.substring(0, 8)}`,
            content: 'Sample post content from workload simulation',
            category: ['technology', 'sports', 'entertainment', 'news', 'lifestyle'][Math.floor(Math.random() * 5)],
            visibility: 'public',
            likes: 0,
            commentCount: 0,
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
      },
      {
        name: 'Edit post',
        type: 'write',
        weight: 10,
        operation: 'update',
        template: (data) => ({
          filter: { userId: data.userId, postId: data.postId },
          update: { $set: { content: 'Edited post content', isEdited: true, updatedAt: new Date() } }
        })
      },
      {
        name: 'Delete post',
        type: 'write',
        weight: 5,
        operation: 'delete',
        template: (data) => ({
          filter: { userId: data.userId, postId: data.postId }
        })
      },
      {
        name: 'Get post by ID',
        type: 'read',
        weight: 10,
        operation: 'find',
        template: (data) => ({
          filter: { postId: data.postId }
        })
      },
      {
        name: 'Like post',
        type: 'write',
        weight: 10,
        operation: 'update',
        template: (data) => ({
          filter: { postId: data.postId },
          update: { $inc: { likes: 1 } }
        })
      },
      {
        name: 'Add comment',
        type: 'write',
        weight: 10,
        operation: 'update',
        template: (data) => ({
          filter: { userId: data.userId, postId: data.postId },
          update: {
            $push: { comments: { commentId: uuidv4(), userId: data.userId, content: 'Sample comment', createdAt: new Date() } },
            $inc: { commentCount: 1 }
          }
        })
      },
      {
        name: 'User engagement stats',
        type: 'read',
        weight: 10,
        operation: 'aggregate',
        template: (data) => ({
          pipeline: [
            { $match: { userId: data.userId } },
            { $group: { _id: '$userId', totalLikes: { $sum: '$likes' }, totalPosts: { $sum: 1 }, avgLikes: { $avg: '$likes' } } }
          ]
        })
      },
      {
        name: 'Get trending posts',
        type: 'read',
        weight: 5,
        operation: 'aggregate',
        template: (data) => ({
          pipeline: [
            { $match: { createdAt: { $gte: data.dateFrom }, visibility: 'public' } },
            { $sort: { likes: -1 } },
            { $limit: 10 }
          ]
        })
      }
    ]
  }
};

/**
 * Get available workload profiles
 */
export function getProfiles() {
  return Object.entries(PROFILES).map(([id, profile]) => ({
    id,
    name: profile.name,
    description: profile.description,
    patterns: profile.patterns.map(p => ({
      name: p.name,
      type: p.type,
      weight: p.weight,
      operation: p.operation
    }))
  }));
}

/**
 * Start workload simulation
 */
export async function startWorkload(database, collection, config, io) {
  if (workloadState.isRunning) {
    throw new Error('Workload simulation is already running');
  }

  const {
    profile = 'ecommerce',
    durationSeconds = 120,
    queriesPerSecond = 15,
    customPatterns = null
  } = config;

  const workloadProfile = PROFILES[profile];
  if (!workloadProfile && !customPatterns) {
    throw new Error(`Unknown workload profile: ${profile}`);
  }

  const patterns = customPatterns || workloadProfile.patterns;

  // Get sample data for generating queries
  const sampleData = await getSampleData(database, collection);

  workloadState = {
    isRunning: true,
    profile,
    config: {
      database,
      collection,
      durationSeconds,
      queriesPerSecond,
      patterns
    },
    stats: {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      byType: { read: 0, write: 0 },
      byOperation: {},
      latencies: [],
      errors: []
    },
    startedAt: new Date().toISOString(),
    abortController: new AbortController()
  };

  // Run workload in background
  runWorkload(database, collection, patterns, sampleData, durationSeconds, queriesPerSecond, io)
    .catch(err => {
      console.error('Workload error:', err);
      workloadState.isRunning = false;
    });

  return {
    success: true,
    message: 'Workload simulation started',
    ...workloadState.config
  };
}

/**
 * Stop workload simulation
 */
export function stopWorkload() {
  if (!workloadState.isRunning) {
    return { success: true, message: 'No workload running' };
  }

  workloadState.abortController?.abort();
  workloadState.isRunning = false;

  return {
    success: true,
    message: 'Workload simulation stopped',
    stats: workloadState.stats
  };
}

/**
 * Get current workload status
 */
export function getWorkloadStatus() {
  if (!workloadState.isRunning) {
    return {
      isRunning: false,
      lastStats: workloadState.stats
    };
  }

  const elapsed = workloadState.startedAt
    ? Math.floor((new Date() - new Date(workloadState.startedAt)) / 1000)
    : 0;

  const remaining = Math.max(0, workloadState.config.durationSeconds - elapsed);
  const progress = workloadState.config.durationSeconds > 0
    ? Math.min(100, (elapsed / workloadState.config.durationSeconds) * 100)
    : 0;

  const actualQps = elapsed > 0
    ? Math.round((workloadState.stats.totalQueries / elapsed) * 10) / 10
    : 0;

  return {
    isRunning: true,
    profile: workloadState.profile,
    config: workloadState.config,
    stats: workloadState.stats,
    elapsed,
    remaining,
    progress,
    actualQps,
    queriesExecuted: workloadState.stats.totalQueries
  };
}

/**
 * Get sample data from the collection for generating realistic queries
 */
async function getSampleData(database, collection) {
  const client = atlasConnection.getClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  // Get a sample of documents to extract field values
  const samples = await coll.aggregate([
    { $sample: { size: 100 } }
  ]).toArray();

  if (samples.length === 0) {
    return {
      customerIds: [uuidv4()],
      orderIds: [uuidv4()],
      userIds: [uuidv4()],
      postIds: [uuidv4()],
      regions: ['NA', 'EU', 'APAC', 'LATAM'],
      statuses: ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
    };
  }

  // Extract unique values from samples
  const extractField = (field) => {
    const values = samples
      .map(s => s[field])
      .filter(v => v !== undefined && v !== null);
    return [...new Set(values)];
  };

  return {
    customerIds: extractField('customerId').length > 0 ? extractField('customerId') : [uuidv4()],
    orderIds: extractField('orderId').length > 0 ? extractField('orderId') : [uuidv4()],
    userIds: extractField('userId').length > 0 ? extractField('userId') : [uuidv4()],
    postIds: extractField('postId').length > 0 ? extractField('postId') : [uuidv4()],
    regions: extractField('region').length > 0 ? extractField('region') : ['NA', 'EU', 'APAC', 'LATAM'],
    statuses: extractField('status').length > 0 ? extractField('status') : ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
  };
}

/**
 * Run the workload simulation
 */
async function runWorkload(database, collection, patterns, sampleData, durationSeconds, queriesPerSecond, io) {
  const client = atlasConnection.getClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  const durationMs = durationSeconds * 1000;
  const intervalMs = 1000 / queriesPerSecond;

  // Build weighted pattern selection
  const weightedPatterns = [];
  for (const pattern of patterns) {
    for (let i = 0; i < pattern.weight; i++) {
      weightedPatterns.push(pattern);
    }
  }

  let queriesExecuted = 0;
  const startTime = Date.now();

  const finish = () => {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const actualQps = elapsedSeconds > 0 ? queriesExecuted / elapsedSeconds : 0;

    workloadState.isRunning = false;
    workloadState.stats.actualDurationSeconds = Math.round(elapsedSeconds);
    workloadState.stats.actualQps = Math.round(actualQps * 10) / 10;

    io?.to(`workload:${database}.${collection}`).emit('workload:complete', workloadState.stats);
  };

  const executeNextQuery = async () => {
    if (!workloadState.isRunning || workloadState.abortController.signal.aborted) {
      return;
    }

    // Stop based on wall-clock time
    const elapsed = Date.now() - startTime;
    if (elapsed >= durationMs) {
      finish();
      return;
    }

    // Select random pattern
    const pattern = weightedPatterns[Math.floor(Math.random() * weightedPatterns.length)];

    // Generate query data
    const data = {
      customerId: sampleData.customerIds[Math.floor(Math.random() * sampleData.customerIds.length)],
      orderId: sampleData.orderIds[Math.floor(Math.random() * sampleData.orderIds.length)],
      userId: sampleData.userIds[Math.floor(Math.random() * sampleData.userIds.length)],
      postId: sampleData.postIds[Math.floor(Math.random() * sampleData.postIds.length)],
      region: sampleData.regions[Math.floor(Math.random() * sampleData.regions.length)],
      status: sampleData.statuses[Math.floor(Math.random() * sampleData.statuses.length)],
      dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    };

    const queryStart = Date.now();

    try {
      const querySpec = pattern.template(data);

      switch (pattern.operation) {
        case 'find':
          await coll.find(querySpec.filter, querySpec.options || {}).limit(20).toArray();
          break;
        case 'aggregate':
          await coll.aggregate(querySpec.pipeline).toArray();
          break;
        case 'update':
          await coll.updateOne(querySpec.filter, querySpec.update);
          break;
        case 'insert':
          await coll.insertOne(querySpec.document);
          break;
        case 'delete':
          await coll.deleteOne(querySpec.filter);
          break;
      }

      const latency = Date.now() - queryStart;

      workloadState.stats.totalQueries++;
      workloadState.stats.successfulQueries++;
      workloadState.stats.byType[pattern.type]++;
      workloadState.stats.byOperation[pattern.operation] = (workloadState.stats.byOperation[pattern.operation] || 0) + 1;
      workloadState.stats.latencies.push(latency);

      // Keep only last 1000 latencies for memory
      if (workloadState.stats.latencies.length > 1000) {
        workloadState.stats.latencies = workloadState.stats.latencies.slice(-1000);
      }

    } catch (error) {
      workloadState.stats.totalQueries++;
      workloadState.stats.failedQueries++;
      workloadState.stats.errors.push({
        pattern: pattern.name,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Keep only last 100 errors
      if (workloadState.stats.errors.length > 100) {
        workloadState.stats.errors = workloadState.stats.errors.slice(-100);
      }
    }

    queriesExecuted++;

    // Emit progress update every 10 queries
    if (queriesExecuted % 10 === 0) {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const progress = Math.min(100, (elapsedSec / durationSeconds) * 100);
      const actualQps = elapsedSec > 0 ? Math.round((queriesExecuted / elapsedSec) * 10) / 10 : 0;

      io?.to(`workload:${database}.${collection}`).emit('workload:progress', {
        queriesExecuted,
        progress,
        elapsed: elapsedSec,
        remaining: Math.max(0, durationSeconds - elapsedSec),
        actualQps,
        stats: workloadState.stats
      });
    }

    // Schedule next query
    setTimeout(executeNextQuery, intervalMs);
  };

  // Start execution
  executeNextQuery();
}

export default {
  getProfiles,
  startWorkload,
  stopWorkload,
  getWorkloadStatus
};
