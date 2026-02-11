import atlasConnection from './atlasConnection.js';

// Store sampling state
let samplingState = {
  isActive: false,
  namespace: null,
  startedAt: null,
  samplesPerSecond: null,
  totalSamples: 0,
  lastCommand: null,
  lastResponse: null
};

/**
 * Start query sampling for a collection
 */
export async function startSampling(database, collection, samplesPerSecond = 10) {
  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');
  const namespace = `${database}.${collection}`;

  // Validate samples per second (1-50)
  const rate = Math.max(1, Math.min(50, samplesPerSecond));

  try {
    const command = {
      configureQueryAnalyzer: namespace,
      mode: 'full',
      samplesPerSecond: rate
    };
    const response = await adminDb.command(command);

    samplingState = {
      isActive: true,
      namespace,
      database,
      collection,
      startedAt: new Date().toISOString(),
      samplesPerSecond: rate,
      totalSamples: 0,
      lastCommand: command,
      lastResponse: response
    };

    return {
      success: true,
      ...samplingState
    };
  } catch (error) {
    throw new Error(`Failed to start query sampling: ${error.message}`);
  }
}

/**
 * Stop query sampling
 */
export async function stopSampling(database, collection) {
  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');
  const namespace = database && collection ? `${database}.${collection}` : samplingState.namespace;

  if (!namespace) {
    throw new Error('No active sampling session');
  }

  try {
    const command = {
      configureQueryAnalyzer: namespace,
      mode: 'off'
    };
    const response = await adminDb.command(command);

    const finalState = { ...samplingState };
    samplingState = {
      isActive: false,
      namespace: null,
      startedAt: null,
      samplesPerSecond: null,
      totalSamples: finalState.totalSamples,
      lastCommand: command,
      lastResponse: response
    };

    return {
      success: true,
      message: 'Query sampling stopped',
      finalStats: finalState
    };
  } catch (error) {
    throw new Error(`Failed to stop query sampling: ${error.message}`);
  }
}

/**
 * Update sampling rate
 */
export async function updateSamplingRate(samplesPerSecond) {
  if (!samplingState.isActive || !samplingState.namespace) {
    throw new Error('No active sampling session');
  }

  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');
  const rate = Math.max(1, Math.min(50, samplesPerSecond));

  try {
    const command = {
      configureQueryAnalyzer: samplingState.namespace,
      mode: 'full',
      samplesPerSecond: rate
    };
    const response = await adminDb.command(command);

    samplingState.samplesPerSecond = rate;
    samplingState.lastCommand = command;
    samplingState.lastResponse = response;

    return {
      success: true,
      samplesPerSecond: rate
    };
  } catch (error) {
    throw new Error(`Failed to update sampling rate: ${error.message}`);
  }
}

/**
 * Get current sampling status via $currentOp
 */
export async function getSamplingStatus() {
  if (!samplingState.isActive) {
    return {
      isActive: false,
      ...samplingState
    };
  }

  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');

  try {
    // Use $currentOp to monitor query analyzer progress
    const result = await adminDb.aggregate([
      { $currentOp: { allUsers: true, localOps: true } },
      { $match: { desc: 'query analyzer' } }
    ]).toArray();

    // Get sample count from config.sampledQueries
    const configDb = client.db('config');
    let sampleCount = 0;

    try {
      sampleCount = await configDb.collection('sampledQueries').countDocuments({
        ns: samplingState.namespace
      });
    } catch (e) {
      // May not have access to config db directly
    }

    const duration = samplingState.startedAt
      ? Math.floor((new Date() - new Date(samplingState.startedAt)) / 1000)
      : 0;

    samplingState.totalSamples = sampleCount;

    return {
      isActive: true,
      ...samplingState,
      durationSeconds: duration,
      analyzerOps: result,
      totalSamples: sampleCount
    };
  } catch (error) {
    return {
      isActive: samplingState.isActive,
      ...samplingState,
      error: error.message
    };
  }
}

/**
 * List sampled queries using $listSampledQueries
 */
export async function listSampledQueries(database, collection, options = {}) {
  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');
  const namespace = `${database}.${collection}`;

  const { limit = 100, skip = 0 } = options;

  try {
    const pipeline = [
      { $listSampledQueries: { namespace } },
      { $sort: { expireAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const queries = await adminDb.aggregate(pipeline).toArray();

    // Get total count
    const countPipeline = [
      { $listSampledQueries: { namespace } },
      { $count: 'total' }
    ];

    const countResult = await adminDb.aggregate(countPipeline).toArray();
    const total = countResult[0]?.total || 0;

    // Categorize queries by type
    const byType = queries.reduce((acc, q) => {
      const type = q.cmdName || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    // Normalize dates in query documents for JSON serialization.
    // $listSampledQueries returns expireAt (Date) but not sampledAt.
    // We use expireAt as the timestamp for display.
    const normalizedQueries = queries.map(q => {
      const dateField = q.expireAt || q.sampledAt;
      let sampledAt = null;
      if (dateField instanceof Date) {
        sampledAt = dateField.toISOString();
      } else if (dateField && typeof dateField === 'object') {
        if (typeof dateField.getHighBits === 'function') {
          sampledAt = new Date(dateField.getHighBits() * 1000).toISOString();
        } else if (typeof dateField.toNumber === 'function') {
          sampledAt = new Date(dateField.toNumber()).toISOString();
        }
      } else if (typeof dateField === 'string') {
        sampledAt = dateField;
      } else if (typeof dateField === 'number') {
        sampledAt = new Date(dateField).toISOString();
      }
      return { ...q, sampledAt };
    });

    return {
      queries: normalizedQueries,
      total,
      byType,
      limit,
      skip
    };
  } catch (error) {
    throw new Error(`Failed to list sampled queries: ${error.message}`);
  }
}

/**
 * Get sampled queries statistics
 */
export async function getSampledQueriesStats(database, collection) {
  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');
  const namespace = `${database}.${collection}`;

  try {
    // Get stats using aggregation
    const pipeline = [
      { $listSampledQueries: { namespace } },
      {
        $group: {
          _id: '$cmdName',
          count: { $sum: 1 },
          samples: { $push: { filter: '$cmd.filter', sampledAt: '$sampledAt' } }
        }
      }
    ];

    const stats = await adminDb.aggregate(pipeline).toArray();

    // Calculate overall stats
    const totalQueries = stats.reduce((sum, s) => sum + s.count, 0);

    const byType = stats.reduce((acc, s) => {
      acc[s._id] = {
        count: s.count,
        percentage: totalQueries > 0 ? ((s.count / totalQueries) * 100).toFixed(1) : 0
      };
      return acc;
    }, {});

    return {
      totalQueries,
      byType,
      samplingState: {
        isActive: samplingState.isActive,
        startedAt: samplingState.startedAt,
        samplesPerSecond: samplingState.samplesPerSecond
      }
    };
  } catch (error) {
    throw new Error(`Failed to get sampling statistics: ${error.message}`);
  }
}

/**
 * Clear sampled queries (for cleanup)
 */
export async function clearSampledQueries(database, collection) {
  const client = atlasConnection.getClient();

  try {
    // Sampled queries are stored in config.sampledQueries
    // Clearing requires appropriate permissions
    const configDb = client.db('config');
    const namespace = `${database}.${collection}`;

    const result = await configDb.collection('sampledQueries').deleteMany({
      ns: namespace
    });

    return {
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    throw new Error(`Failed to clear sampled queries: ${error.message}`);
  }
}

export default {
  startSampling,
  stopSampling,
  updateSamplingRate,
  getSamplingStatus,
  listSampledQueries,
  getSampledQueriesStats,
  clearSampledQueries
};
