/**
 * Scoring weights for shard key evaluation
 */
const WEIGHTS = {
  cardinality: 0.25,      // numDistinctValues / numDocsTotal ratio
  frequency: 0.20,        // Evenness of mostCommonValues distribution
  monotonicity: 0.15,     // Bonus for non-monotonic
  readTargeting: 0.20,    // percentageOfSingleShardReads
  writeTargeting: 0.20    // percentageOfSingleShardWrites
};

/**
 * Calculate overall score for a shard key analysis result
 */
export function calculateScore(analysis) {
  const scores = {
    cardinality: calculateCardinalityScore(analysis.keyCharacteristics),
    frequency: calculateFrequencyScore(analysis.keyCharacteristics),
    monotonicity: calculateMonotonicityScore(analysis.keyCharacteristics),
    readTargeting: calculateReadTargetingScore(analysis.readDistribution),
    writeTargeting: calculateWriteTargetingScore(analysis.writeDistribution)
  };

  // Calculate weighted overall score
  const overall = Math.round(
    scores.cardinality * WEIGHTS.cardinality +
    scores.frequency * WEIGHTS.frequency +
    scores.monotonicity * WEIGHTS.monotonicity +
    scores.readTargeting * WEIGHTS.readTargeting +
    scores.writeTargeting * WEIGHTS.writeTargeting
  );

  return {
    ...scores,
    overall,
    weights: WEIGHTS,
    grade: getGrade(overall)
  };
}

/**
 * Calculate cardinality score (0-100)
 * Based on ratio of distinct values to total documents
 */
function calculateCardinalityScore(kc) {
  if (!kc || kc.numDocsTotal === 0) return 50;

  const { numDistinctValues, numDocsTotal } = kc;

  // Score based on cardinality ratio
  const ratio = numDistinctValues / numDocsTotal;

  // Very low cardinality (< 10 values) is penalized heavily
  if (numDistinctValues < 10) {
    return Math.round((numDistinctValues / 10) * 20);
  }

  // Low cardinality (< 100 values) is still problematic
  if (numDistinctValues < 100) {
    return Math.round(20 + ((numDistinctValues - 10) / 90) * 30);
  }

  // Ratio-based scoring for higher cardinality
  if (ratio >= 0.5) {
    return 100;
  } else if (ratio >= 0.3) {
    return 90 + Math.round((ratio - 0.3) * 50);
  } else if (ratio >= 0.1) {
    return 70 + Math.round((ratio - 0.1) * 100);
  } else if (ratio >= 0.01) {
    return 50 + Math.round((ratio - 0.01) * 222);
  } else {
    return Math.round(ratio * 5000);
  }
}

/**
 * Calculate frequency score (0-100)
 * Based on evenness of value distribution
 */
function calculateFrequencyScore(kc) {
  if (!kc || !kc.mostCommonValues || kc.mostCommonValues.length === 0) return 50;

  const { mostCommonValues, numDocsTotal, numDistinctValues } = kc;

  if (numDistinctValues === 0 || numDocsTotal === 0) return 50;

  // Calculate expected average frequency
  const expectedAvg = numDocsTotal / numDistinctValues;

  // Get the max frequency from most common values
  const maxFrequency = mostCommonValues[0]?.frequency || 0;

  // If unique, perfect frequency distribution
  if (kc.isUnique) {
    return 100;
  }

  // Calculate how much the max deviates from expected
  const deviationRatio = maxFrequency / expectedAvg;

  // Perfect distribution: maxFreq ~= expectedAvg (ratio near 1)
  // Bad distribution: maxFreq >> expectedAvg (ratio >> 1)
  if (deviationRatio <= 1.5) {
    return 100;
  } else if (deviationRatio <= 2) {
    return 90;
  } else if (deviationRatio <= 3) {
    return 80;
  } else if (deviationRatio <= 5) {
    return 70;
  } else if (deviationRatio <= 10) {
    return 50;
  } else if (deviationRatio <= 20) {
    return 30;
  } else {
    return Math.max(0, 20 - Math.floor(deviationRatio / 10));
  }
}

/**
 * Calculate monotonicity score (0-100)
 * Penalizes monotonically increasing/decreasing keys
 */
function calculateMonotonicityScore(kc) {
  if (!kc || !kc.monotonicity) return 50;

  const { type, correlationCoefficient } = kc.monotonicity;

  switch (type) {
    case 'not monotonic':
      return 100;
    case 'unknown':
      return 50;
    case 'monotonic':
      // Use correlation coefficient if available
      if (correlationCoefficient !== null) {
        const absCorrelation = Math.abs(correlationCoefficient);
        // High correlation = bad (monotonic)
        return Math.round((1 - absCorrelation) * 100);
      }
      return 0;
    default:
      return 50;
  }
}

/**
 * Calculate read targeting score (0-100)
 * Based on percentage of single-shard reads
 */
function calculateReadTargetingScore(rd) {
  if (!rd || rd.sampleSize?.total === 0) {
    // No read samples, return neutral score
    return 50;
  }

  // Direct mapping: percentageOfSingleShardReads = score
  // But also penalize scatter-gather heavily
  const singleShard = rd.percentageOfSingleShardReads || 0;
  const scatterGather = rd.percentageOfScatterGatherReads || 0;

  // Base score from single shard percentage
  let score = singleShard;

  // Additional penalty for high scatter-gather
  if (scatterGather > 50) {
    score = Math.max(0, score - (scatterGather - 50) * 0.5);
  }

  return Math.round(score);
}

/**
 * Calculate write targeting score (0-100)
 * Based on percentage of single-shard writes
 */
function calculateWriteTargetingScore(wd) {
  if (!wd || wd.sampleSize?.total === 0) {
    // No write samples, return neutral score
    return 50;
  }

  // Start with single-shard write percentage
  let score = wd.percentageOfSingleShardWrites || 0;

  // Penalize shard key updates (document migration)
  const shardKeyUpdates = wd.percentageOfShardKeyUpdates || 0;
  if (shardKeyUpdates > 0) {
    score = Math.max(0, score - shardKeyUpdates * 2);
  }

  // Penalize writes without shard key
  const writesWithoutKey = (wd.percentageOfSingleWritesWithoutShardKey || 0) +
    (wd.percentageOfMultiWritesWithoutShardKey || 0);
  if (writesWithoutKey > 10) {
    score = Math.max(0, score - (writesWithoutKey - 10) * 0.5);
  }

  return Math.round(score);
}

/**
 * Get letter grade based on score
 */
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Generate recommendations based on analysis results
 */
export function generateRecommendations(results) {
  if (!results || results.length === 0) {
    return [];
  }

  const recommendations = [];
  const bestCandidate = results[0]; // Already sorted by score

  // Primary recommendation
  recommendations.push({
    type: 'primary',
    title: 'Recommended Shard Key',
    key: bestCandidate.keyString,
    score: bestCandidate.score.overall,
    grade: bestCandidate.score.grade,
    reasons: generateReasons(bestCandidate)
  });

  // Secondary option if close in score
  if (results.length > 1) {
    const second = results[1];
    const scoreDiff = bestCandidate.score.overall - second.score.overall;

    if (scoreDiff < 10) {
      recommendations.push({
        type: 'alternative',
        title: 'Close Alternative',
        key: second.keyString,
        score: second.score.overall,
        grade: second.score.grade,
        reasons: generateReasons(second),
        note: `Only ${scoreDiff} points behind the top choice`
      });
    }
  }

  // Warnings for bad candidates
  for (const result of results) {
    if (result.score.overall < 40) {
      recommendations.push({
        type: 'avoid',
        title: 'Avoid This Key',
        key: result.keyString,
        score: result.score.overall,
        grade: result.score.grade,
        reasons: generateWarningReasons(result)
      });
    }
  }

  // General tips based on analysis
  const tips = [];

  // Check if any candidate has low read targeting
  const lowReadTargeting = results.some(r => r.score.readTargeting < 50);
  if (lowReadTargeting) {
    tips.push({
      type: 'tip',
      message: 'Consider creating compound indexes that include your most common query filters alongside the shard key.'
    });
  }

  // Check if monotonicity is an issue
  const monotonicIssue = results.some(r =>
    r.keyCharacteristics?.monotonicity?.type === 'monotonic'
  );
  if (monotonicIssue) {
    tips.push({
      type: 'tip',
      message: 'For time-series data, consider using a hashed shard key or combining timestamp with a non-monotonic field.'
    });
  }

  // Low cardinality warning
  const lowCardinality = results.some(r =>
    r.keyCharacteristics?.numDistinctValues < 100
  );
  if (lowCardinality) {
    tips.push({
      type: 'tip',
      message: 'Low cardinality limits horizontal scaling. Consider combining with another field to create a compound shard key.'
    });
  }

  if (tips.length > 0) {
    recommendations.push(...tips);
  }

  return recommendations;
}

/**
 * Generate positive reasons for a shard key recommendation
 */
function generateReasons(result) {
  const reasons = [];
  const kc = result.keyCharacteristics;
  const rd = result.readDistribution;
  const wd = result.writeDistribution;

  if (result.score.cardinality >= 80) {
    reasons.push(`High cardinality (${kc?.numDistinctValues?.toLocaleString() || 'many'} distinct values)`);
  }

  if (result.score.frequency >= 80) {
    reasons.push('Even value distribution - no hotspots detected');
  }

  if (result.score.monotonicity >= 80) {
    reasons.push('Non-monotonic - writes distributed evenly');
  }

  if (rd && rd.percentageOfSingleShardReads >= 70) {
    reasons.push(`${rd.percentageOfSingleShardReads.toFixed(0)}% of reads target single shard`);
  }

  if (wd && wd.percentageOfSingleShardWrites >= 70) {
    reasons.push(`${wd.percentageOfSingleShardWrites.toFixed(0)}% of writes target single shard`);
  }

  if (kc?.isUnique) {
    reasons.push('Unique values ensure perfect distribution');
  }

  return reasons;
}

/**
 * Generate warning reasons for a poor shard key
 */
function generateWarningReasons(result) {
  const reasons = [];
  const kc = result.keyCharacteristics;
  const rd = result.readDistribution;
  const wd = result.writeDistribution;

  if (result.score.cardinality < 40) {
    reasons.push(`Very low cardinality (only ${kc?.numDistinctValues || 'few'} distinct values)`);
  }

  if (result.score.frequency < 40) {
    reasons.push('Uneven distribution creates hotspots');
  }

  if (kc?.monotonicity?.type === 'monotonic') {
    reasons.push('Monotonically increasing - all inserts go to one shard');
  }

  if (rd && rd.percentageOfScatterGatherReads >= 50) {
    reasons.push(`${rd.percentageOfScatterGatherReads.toFixed(0)}% of reads scatter to all shards`);
  }

  if (wd && wd.percentageOfShardKeyUpdates > 5) {
    reasons.push(`${wd.percentageOfShardKeyUpdates.toFixed(0)}% of writes update the shard key`);
  }

  return reasons;
}

export default {
  calculateScore,
  generateRecommendations,
  WEIGHTS
};
