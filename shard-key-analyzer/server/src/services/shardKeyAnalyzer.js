import atlasConnection from './atlasConnection.js';
import { calculateScore, generateRecommendations } from '../utils/scoring.js';

// Store analysis results in memory (capped at 100 entries, oldest evicted first)
const MAX_RESULTS = 100;
const analysisResults = new Map();

/**
 * Analyze a single shard key candidate
 */
export async function analyzeShardKey(database, collection, key, options = {}) {
  const client = atlasConnection.getClient();
  const adminDb = client.db('admin');
  const namespace = `${database}.${collection}`;

  const {
    keyCharacteristics = true,
    readWriteDistribution = true,
    sampleSize = 10000,
    sampleRate = null
  } = options;

  try {
    const command = {
      analyzeShardKey: namespace,
      key,
      keyCharacteristics,
      readWriteDistribution
    };

    // Add sample size or rate
    if (sampleRate !== null) {
      command.sampleRate = sampleRate;
    } else {
      command.sampleSize = sampleSize;
    }

    const result = await adminDb.command(command);

    // Parse and enhance the result
    const analysis = parseAnalysisResult(result, key);

    // Store raw command and MongoDB response for transparency
    analysis.rawCommand = command;
    analysis.rawOutput = result;

    // Calculate overall score
    analysis.score = calculateScore(analysis);

    // Store result (evict oldest if at capacity)
    const analysisId = `${namespace}-${JSON.stringify(key)}-${Date.now()}`;
    if (analysisResults.size >= MAX_RESULTS) {
      const oldestKey = analysisResults.keys().next().value;
      analysisResults.delete(oldestKey);
    }
    analysisResults.set(analysisId, analysis);

    return {
      id: analysisId,
      ...analysis
    };
  } catch (error) {
    throw new Error(`Failed to analyze shard key: ${error.message}`);
  }
}

/**
 * Analyze multiple shard key candidates
 */
export async function analyzeMultipleCandidates(database, collection, candidates, options = {}) {
  const results = [];
  const errors = [];

  for (const candidate of candidates) {
    try {
      const result = await analyzeShardKey(database, collection, candidate.key, options);
      results.push({
        key: candidate.key,
        label: candidate.label || JSON.stringify(candidate.key),
        ...result
      });
    } catch (error) {
      errors.push({
        key: candidate.key,
        error: error.message
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score.overall - a.score.overall);

  // Generate comparison data
  const comparison = generateComparison(results);

  // Generate recommendations
  const recommendations = generateRecommendations(results);

  return {
    results,
    errors,
    comparison,
    recommendations,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Parse the raw analysis result from MongoDB
 */
function parseAnalysisResult(result, key) {
  const analysis = {
    key,
    keyString: JSON.stringify(key),
    keyCharacteristics: null,
    readDistribution: null,
    writeDistribution: null,
    warnings: [],
    recommendations: []
  };

  // Parse key characteristics
  if (result.keyCharacteristics) {
    const kc = result.keyCharacteristics;

    analysis.keyCharacteristics = {
      numDocsTotal: kc.numDocsTotal || 0,
      numOrphanDocs: kc.numOrphanDocs || 0,
      avgDocSizeBytes: kc.avgDocSizeBytes || 0,
      numDocsSampled: kc.numDocsSampled || 0,
      isUnique: kc.isUnique || false,
      numDistinctValues: kc.numDistinctValues || 0,
      mostCommonValues: (kc.mostCommonValues || []).map(mcv => ({
        value: formatValue(mcv.value),
        frequency: mcv.frequency
      })),
      monotonicity: {
        type: kc.monotonicity?.type || 'unknown',
        correlationCoefficient: kc.monotonicity?.recordIdCorrelationCoefficient || null
      }
    };

    // Calculate cardinality ratio using numDocsSampled (not numDocsTotal)
    // because numDistinctValues is counted from the sample, not the full collection
    const cardinalityRatio = analysis.keyCharacteristics.numDocsSampled > 0
      ? analysis.keyCharacteristics.numDistinctValues / analysis.keyCharacteristics.numDocsSampled
      : 0;

    analysis.keyCharacteristics.cardinalityRatio = cardinalityRatio;

    // Add warnings based on characteristics
    if (analysis.keyCharacteristics.numDistinctValues < 10) {
      analysis.warnings.push({
        severity: 'error',
        message: `Very low cardinality (${analysis.keyCharacteristics.numDistinctValues} distinct values). This severely limits horizontal scaling.`
      });
    } else if (cardinalityRatio < 0.1) {
      analysis.warnings.push({
        severity: 'warning',
        message: `Low cardinality ratio (${(cardinalityRatio * 100).toFixed(1)}%). Consider a compound shard key for better distribution.`
      });
    }

    if (analysis.keyCharacteristics.monotonicity.type === 'monotonic') {
      analysis.warnings.push({
        severity: 'warning',
        message: 'Monotonically increasing/decreasing shard key detected. This routes all inserts to one shard.'
      });
    }

    // Check for hotspots in mostCommonValues
    const values = analysis.keyCharacteristics.mostCommonValues;
    if (values.length > 0) {
      const maxFreq = values[0].frequency;
      const avgFreq = analysis.keyCharacteristics.numDocsTotal / analysis.keyCharacteristics.numDistinctValues;

      if (maxFreq > avgFreq * 5) {
        analysis.warnings.push({
          severity: 'warning',
          message: `Potential hotspot detected. Most common value appears ${maxFreq} times (${((maxFreq / analysis.keyCharacteristics.numDocsTotal) * 100).toFixed(1)}% of documents).`
        });
      }
    }
  }

  // Parse read distribution
  if (result.readDistribution) {
    const rd = result.readDistribution;

    analysis.readDistribution = {
      sampleSize: {
        total: rd.sampleSize?.total || 0,
        find: rd.sampleSize?.find || 0,
        aggregate: rd.sampleSize?.aggregate || 0,
        count: rd.sampleSize?.count || 0,
        distinct: rd.sampleSize?.distinct || 0
      },
      percentageOfSingleShardReads: rd.percentageOfSingleShardReads || 0,
      percentageOfMultiShardReads: rd.percentageOfMultiShardReads || 0,
      percentageOfScatterGatherReads: rd.percentageOfScatterGatherReads || 0,
      numReadsByRange: rd.numReadsByRange || []
    };

    // Add warning for high scatter-gather
    if (analysis.readDistribution.percentageOfScatterGatherReads > 50) {
      analysis.warnings.push({
        severity: 'warning',
        message: `High scatter-gather reads (${analysis.readDistribution.percentageOfScatterGatherReads.toFixed(1)}%). Most read queries don't filter by this shard key.`
      });
    }
  }

  // Parse write distribution
  if (result.writeDistribution) {
    const wd = result.writeDistribution;

    analysis.writeDistribution = {
      sampleSize: {
        total: wd.sampleSize?.total || 0,
        update: wd.sampleSize?.update || 0,
        delete: wd.sampleSize?.delete || 0,
        findAndModify: wd.sampleSize?.findAndModify || 0
      },
      percentageOfSingleShardWrites: wd.percentageOfSingleShardWrites || 0,
      percentageOfMultiShardWrites: wd.percentageOfMultiShardWrites || 0,
      percentageOfScatterGatherWrites: wd.percentageOfScatterGatherWrites || 0,
      numWritesByRange: wd.numWritesByRange || [],
      percentageOfShardKeyUpdates: wd.percentageOfShardKeyUpdates || 0,
      percentageOfSingleWritesWithoutShardKey: wd.percentageOfSingleWritesWithoutShardKey || 0,
      percentageOfMultiWritesWithoutShardKey: wd.percentageOfMultiWritesWithoutShardKey || 0
    };

    // Add warning for shard key updates
    if (analysis.writeDistribution.percentageOfShardKeyUpdates > 5) {
      analysis.warnings.push({
        severity: 'warning',
        message: `${analysis.writeDistribution.percentageOfShardKeyUpdates.toFixed(1)}% of writes update the shard key field. This requires document migration between shards.`
      });
    }
  }

  return analysis;
}

/**
 * Format a value for display
 */
function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    // Handle ObjectId, UUID, etc.
    if (value.$oid) return `ObjectId("${value.$oid}")`;
    if (value.$uuid) return `UUID("${value.$uuid}")`;
    if (value.$date) return new Date(value.$date).toISOString();
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Generate comparison data for multiple candidates
 */
function generateComparison(results) {
  if (results.length === 0) return null;

  // Extract metrics for comparison
  const metrics = results.map(r => ({
    key: r.keyString,
    label: r.label,
    cardinality: r.score.cardinality,
    frequency: r.score.frequency,
    monotonicity: r.score.monotonicity,
    readTargeting: r.score.readTargeting,
    writeTargeting: r.score.writeTargeting,
    overall: r.score.overall,
    warnings: r.warnings.length
  }));

  // Find best and worst for each metric
  const bestOverall = results[0]; // Already sorted
  const worstOverall = results[results.length - 1];

  return {
    metrics,
    bestCandidate: {
      key: bestOverall.keyString,
      score: bestOverall.score.overall
    },
    worstCandidate: {
      key: worstOverall.keyString,
      score: worstOverall.score.overall
    },
    scoreDifference: bestOverall.score.overall - worstOverall.score.overall
  };
}

/**
 * Get analysis result by ID
 */
export function getAnalysisResult(id) {
  return analysisResults.get(id) || null;
}

/**
 * Clear all stored analysis results
 */
export function clearAnalysisResults() {
  analysisResults.clear();
  return { success: true };
}

/**
 * Check if a supporting index exists for the shard key
 */
export async function checkSupportingIndex(database, collection, key) {
  const client = atlasConnection.getClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  const indexes = await coll.indexes();

  // Check if any existing index can support the shard key
  // The shard key must be a prefix of an existing index
  const keyFields = Object.keys(key);

  for (const index of indexes) {
    const indexFields = Object.keys(index.key);

    // Check if shard key fields are a prefix of this index
    let isPrefix = true;
    for (let i = 0; i < keyFields.length; i++) {
      if (indexFields[i] !== keyFields[i]) {
        isPrefix = false;
        break;
      }
    }

    if (isPrefix) {
      return {
        exists: true,
        indexName: index.name,
        indexKey: index.key,
        unique: index.unique || false
      };
    }
  }

  // Generate the index creation command
  const createIndexCommand = `db.${collection}.createIndex(${JSON.stringify(key)})`;

  return {
    exists: false,
    requiredIndex: key,
    createCommand: createIndexCommand
  };
}

export default {
  analyzeShardKey,
  analyzeMultipleCandidates,
  getAnalysisResult,
  clearAnalysisResults,
  checkSupportingIndex
};
