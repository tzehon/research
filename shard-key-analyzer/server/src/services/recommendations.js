import atlasConnection from './atlasConnection.js';

/**
 * Generate shard key recommendations based on collection schema
 */
export async function generateCandidateRecommendations(database, collection) {
  const client = atlasConnection.getClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  // Sample documents to understand schema
  const samples = await coll.aggregate([
    { $sample: { size: 100 } }
  ]).toArray();

  if (samples.length === 0) {
    return {
      candidates: [],
      message: 'No documents found in collection'
    };
  }

  // Analyze schema
  const fieldAnalysis = analyzeFields(samples);

  // Get existing indexes
  const indexes = await coll.indexes();

  // Generate candidates
  const candidates = generateCandidates(fieldAnalysis, indexes);

  return {
    candidates,
    fieldAnalysis,
    indexInfo: indexes.map(idx => ({
      name: idx.name,
      key: idx.key,
      unique: idx.unique || false
    }))
  };
}

/**
 * Analyze fields from sample documents
 */
function analyzeFields(samples) {
  const fieldStats = new Map();

  for (const doc of samples) {
    analyzeDocument(doc, '', fieldStats);
  }

  // Calculate statistics for each field
  const analysis = [];

  for (const [fieldPath, stats] of fieldStats) {
    // Skip nested arrays and complex types for shard key candidates
    if (stats.types.has('array') || stats.types.has('object')) {
      continue;
    }

    // Skip _id as it's often not ideal
    if (fieldPath === '_id') {
      continue;
    }

    const distinctRatio = stats.distinctValues.size / samples.length;
    const nullRatio = stats.nullCount / samples.length;

    analysis.push({
      field: fieldPath,
      types: Array.from(stats.types),
      distinctValues: stats.distinctValues.size,
      distinctRatio,
      nullRatio,
      sampleValues: Array.from(stats.distinctValues).slice(0, 5),
      recommendation: getFieldRecommendation(fieldPath, stats, samples.length)
    });
  }

  // Sort by recommendation quality
  analysis.sort((a, b) => b.recommendation.score - a.recommendation.score);

  return analysis;
}

/**
 * Recursively analyze document fields
 */
function analyzeDocument(obj, prefix, fieldStats, depth = 0) {
  if (depth > 3) return; // Limit nesting depth

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (!fieldStats.has(fieldPath)) {
      fieldStats.set(fieldPath, {
        types: new Set(),
        distinctValues: new Set(),
        nullCount: 0
      });
    }

    const stats = fieldStats.get(fieldPath);
    const valueType = getValueType(value);
    stats.types.add(valueType);

    if (value === null || value === undefined) {
      stats.nullCount++;
    } else if (valueType !== 'object' && valueType !== 'array') {
      // Store distinct values (limited to avoid memory issues)
      if (stats.distinctValues.size < 1000) {
        stats.distinctValues.add(JSON.stringify(value));
      }
    }

    // Recurse into nested objects (but not arrays)
    if (valueType === 'object' && value !== null) {
      analyzeDocument(value, fieldPath, fieldStats, depth + 1);
    }
  }
}

/**
 * Get the type of a value
 */
function getValueType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';

  // Check for BSON types
  if (value._bsontype) {
    return value._bsontype.toLowerCase();
  }

  return typeof value;
}

/**
 * Get recommendation for a field as a shard key
 */
function getFieldRecommendation(fieldPath, stats, totalDocs) {
  let score = 50; // Start neutral
  const reasons = [];
  const warnings = [];

  const distinctRatio = stats.distinctValues.size / totalDocs;
  const types = Array.from(stats.types);

  // Cardinality scoring
  if (stats.distinctValues.size >= totalDocs * 0.5) {
    score += 20;
    reasons.push('High cardinality');
  } else if (stats.distinctValues.size >= totalDocs * 0.1) {
    score += 10;
    reasons.push('Moderate cardinality');
  } else if (stats.distinctValues.size < 10) {
    score -= 30;
    warnings.push('Very low cardinality');
  } else {
    score -= 10;
    warnings.push('Low cardinality');
  }

  // Type scoring - prefer certain types
  if (types.includes('string') || types.includes('uuid') || types.includes('objectid')) {
    score += 10;
    reasons.push('Good type for shard key');
  }

  // Penalize dates (often monotonic)
  if (types.includes('date')) {
    score -= 15;
    warnings.push('Date fields are often monotonic');
  }

  // Penalize fields with nulls
  const nullRatio = stats.nullCount / totalDocs;
  if (nullRatio > 0.1) {
    score -= 20;
    warnings.push(`${(nullRatio * 100).toFixed(0)}% null values`);
  } else if (nullRatio > 0) {
    score -= 5;
  }

  // Field name heuristics
  const lowerField = fieldPath.toLowerCase();

  // Good candidates
  if (lowerField.includes('customer') || lowerField.includes('user') || lowerField.includes('tenant')) {
    score += 15;
    reasons.push('Common query filter field');
  }

  if (lowerField.includes('id') && !lowerField.includes('_id')) {
    score += 10;
    reasons.push('ID field - likely used in queries');
  }

  // Potential issues
  if (lowerField.includes('timestamp') || lowerField.includes('createdat') || lowerField.includes('created_at')) {
    score -= 20;
    warnings.push('Timestamp fields are monotonically increasing');
  }

  if (lowerField.includes('status') || lowerField.includes('state') || lowerField.includes('type')) {
    if (stats.distinctValues.size < 20) {
      score -= 15;
      warnings.push('Enum-like field with few values');
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    rating: score >= 70 ? 'recommended' : score >= 40 ? 'possible' : 'avoid',
    reasons,
    warnings
  };
}

/**
 * Generate candidate shard keys
 */
function generateCandidates(fieldAnalysis, indexes) {
  const candidates = [];

  // Single field candidates from analysis
  for (const field of fieldAnalysis) {
    if (field.recommendation.score >= 40) {
      candidates.push({
        key: { [field.field]: 1 },
        label: field.field,
        type: 'single',
        score: field.recommendation.score,
        rating: field.recommendation.rating,
        reasons: field.recommendation.reasons,
        warnings: field.recommendation.warnings,
        hasIndex: indexes.some(idx => Object.keys(idx.key)[0] === field.field)
      });

      // Also suggest hashed version for high-cardinality fields
      if (field.distinctRatio > 0.5) {
        const hashedScore = field.recommendation.score - 5;
        candidates.push({
          key: { [field.field]: 'hashed' },
          label: `${field.field} (hashed)`,
          type: 'single-hashed',
          score: hashedScore,
          rating: hashedScore >= 70 ? 'recommended' : hashedScore >= 40 ? 'possible' : 'avoid',
          reasons: [...field.recommendation.reasons, 'Hashed for even distribution'],
          warnings: field.recommendation.warnings,
          hasIndex: indexes.some(idx => idx.key[field.field] === 'hashed')
        });
      }
    }
  }

  // Compound candidates - combine top fields
  const topFields = fieldAnalysis.slice(0, 5).filter(f => f.recommendation.score >= 30);

  for (let i = 0; i < topFields.length; i++) {
    for (let j = i + 1; j < topFields.length; j++) {
      const field1 = topFields[i];
      const field2 = topFields[j];

      // Skip if both have warnings about monotonicity
      const bothMonotonic = field1.recommendation.warnings.some(w => w.includes('monotonic')) &&
        field2.recommendation.warnings.some(w => w.includes('monotonic'));

      if (bothMonotonic) continue;

      const compoundScore = Math.round((field1.recommendation.score + field2.recommendation.score) / 2);

      candidates.push({
        key: { [field1.field]: 1, [field2.field]: 1 },
        label: `${field1.field} + ${field2.field}`,
        type: 'compound',
        score: compoundScore,
        rating: compoundScore >= 70 ? 'recommended' : compoundScore >= 40 ? 'possible' : 'avoid',
        reasons: ['Compound key for better distribution', ...field1.recommendation.reasons.slice(0, 1)],
        warnings: [],
        hasIndex: indexes.some(idx => {
          const keys = Object.keys(idx.key);
          return keys[0] === field1.field && keys[1] === field2.field;
        })
      });
    }
  }

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);

  // Deduplicate and limit
  const seen = new Set();
  const uniqueCandidates = [];

  for (const candidate of candidates) {
    const keyStr = JSON.stringify(candidate.key);
    if (!seen.has(keyStr)) {
      seen.add(keyStr);
      uniqueCandidates.push(candidate);
      if (uniqueCandidates.length >= 10) break;
    }
  }

  return uniqueCandidates;
}

export default {
  generateCandidateRecommendations
};
