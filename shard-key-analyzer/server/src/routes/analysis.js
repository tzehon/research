import { Router } from 'express';
import shardKeyAnalyzer from '../services/shardKeyAnalyzer.js';
import { validateNamespace, validateShardKey, validateAnalysisConfig } from '../utils/validators.js';
import { emitAnalysisProgress, emitAnalysisComplete } from '../socket/handlers.js';

const router = Router();

/**
 * POST /api/analysis/analyze
 * Analyze shard key candidates
 */
router.post('/analyze', async (req, res) => {
  try {
    const {
      database,
      collection,
      candidates,
      sampleSize = 10000,
      sampleRate = null,
      keyCharacteristics = true,
      readWriteDistribution = true
    } = req.body;

    // Validate namespace
    const nsValidation = validateNamespace(database, collection);
    if (!nsValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid namespace',
        details: nsValidation.errors
      });
    }

    // Validate candidates
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({
        error: 'At least one candidate shard key is required'
      });
    }

    // Validate each candidate
    for (const candidate of candidates) {
      const keyValidation = validateShardKey(candidate.key);
      if (!keyValidation.isValid) {
        return res.status(400).json({
          error: `Invalid shard key: ${JSON.stringify(candidate.key)}`,
          details: keyValidation.errors
        });
      }
    }

    // Validate analysis config
    const configValidation = validateAnalysisConfig({ sampleSize, sampleRate });
    if (!configValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid analysis configuration',
        details: configValidation.errors
      });
    }

    const io = req.app.get('io');
    const analysisId = `analysis-${Date.now()}`;

    // Start analysis with progress tracking
    const results = [];
    const errors = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      // Emit progress to subscribers
      if (io) {
        emitAnalysisProgress(io, analysisId, {
          analysisId,
          current: i,
          total: candidates.length,
          currentKey: candidate.key,
          status: 'analyzing'
        });
      }

      try {
        const result = await shardKeyAnalyzer.analyzeShardKey(
          database,
          collection,
          candidate.key,
          {
            keyCharacteristics,
            readWriteDistribution,
            sampleSize,
            sampleRate
          }
        );

        results.push({
          key: candidate.key,
          label: candidate.label || JSON.stringify(candidate.key),
          ...result
        });

        // Emit individual result to subscribers
        if (io) {
          emitAnalysisProgress(io, analysisId, {
            analysisId,
            index: i,
            result,
            status: 'candidateComplete'
          });
        }

      } catch (error) {
        errors.push({
          key: candidate.key,
          error: error.message
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score.overall - a.score.overall);

    // Generate comparison and recommendations
    const comparison = generateComparison(results);
    const recommendations = generateRecommendations(results);

    const finalResult = {
      id: analysisId,
      database,
      collection,
      results,
      errors,
      comparison,
      recommendations,
      analyzedAt: new Date().toISOString()
    };

    // Emit completion to subscribers
    if (io) {
      emitAnalysisComplete(io, analysisId, finalResult);
    }

    res.json(finalResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analysis/analyze-single
 * Analyze a single shard key
 */
router.post('/analyze-single', async (req, res) => {
  try {
    const {
      database,
      collection,
      key,
      sampleSize = 10000,
      keyCharacteristics = true,
      readWriteDistribution = true
    } = req.body;

    // Validate
    const nsValidation = validateNamespace(database, collection);
    if (!nsValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid namespace',
        details: nsValidation.errors
      });
    }

    const keyValidation = validateShardKey(key);
    if (!keyValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid shard key',
        details: keyValidation.errors
      });
    }

    const result = await shardKeyAnalyzer.analyzeShardKey(
      database,
      collection,
      key,
      { keyCharacteristics, readWriteDistribution, sampleSize }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analysis/results/:id
 * Get analysis results by ID
 */
router.get('/results/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = shardKeyAnalyzer.getAnalysisResult(id);

    if (!result) {
      return res.status(404).json({ error: 'Analysis result not found' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analysis/check-index
 * Check if supporting index exists
 */
router.post('/check-index', async (req, res) => {
  try {
    const { database, collection, key } = req.body;

    // Validate
    const nsValidation = validateNamespace(database, collection);
    if (!nsValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid namespace',
        details: nsValidation.errors
      });
    }

    const keyValidation = validateShardKey(key);
    if (!keyValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid shard key',
        details: keyValidation.errors
      });
    }

    const result = await shardKeyAnalyzer.checkSupportingIndex(database, collection, key);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/analysis/results
 * Clear all analysis results
 */
router.delete('/results', (req, res) => {
  try {
    const result = shardKeyAnalyzer.clearAnalysisResults();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate comparison data
 */
function generateComparison(results) {
  if (results.length === 0) return null;

  const metrics = results.map(r => ({
    key: r.keyString || JSON.stringify(r.key),
    label: r.label,
    cardinality: r.score.cardinality,
    frequency: r.score.frequency,
    monotonicity: r.score.monotonicity,
    readTargeting: r.score.readTargeting,
    writeTargeting: r.score.writeTargeting,
    overall: r.score.overall,
    grade: r.score.grade,
    warnings: r.warnings?.length || 0
  }));

  return {
    metrics,
    bestCandidate: results[0] ? {
      key: results[0].keyString || JSON.stringify(results[0].key),
      score: results[0].score.overall,
      grade: results[0].score.grade
    } : null,
    worstCandidate: results.length > 1 ? {
      key: results[results.length - 1].keyString || JSON.stringify(results[results.length - 1].key),
      score: results[results.length - 1].score.overall,
      grade: results[results.length - 1].score.grade
    } : null
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations(results) {
  const recommendations = [];

  if (results.length === 0) return recommendations;

  // Primary recommendation
  const best = results[0];
  recommendations.push({
    type: 'primary',
    title: 'Recommended Shard Key',
    key: best.keyString || JSON.stringify(best.key),
    score: best.score.overall,
    grade: best.score.grade,
    reasons: getPositiveReasons(best)
  });

  // Alternative if close
  if (results.length > 1) {
    const second = results[1];
    const diff = best.score.overall - second.score.overall;

    if (diff < 10) {
      recommendations.push({
        type: 'alternative',
        title: 'Close Alternative',
        key: second.keyString || JSON.stringify(second.key),
        score: second.score.overall,
        grade: second.score.grade,
        note: `Only ${diff} points behind`
      });
    }
  }

  // Warnings
  for (const result of results) {
    if (result.score.overall < 40) {
      recommendations.push({
        type: 'avoid',
        title: 'Not Recommended',
        key: result.keyString || JSON.stringify(result.key),
        score: result.score.overall,
        reasons: result.warnings?.map(w => w.message) || []
      });
    }
  }

  return recommendations;
}

/**
 * Get positive reasons for a recommendation
 */
function getPositiveReasons(result) {
  const reasons = [];

  if (result.score.cardinality >= 80) {
    reasons.push('High cardinality for good distribution');
  }
  if (result.score.frequency >= 80) {
    reasons.push('Even value distribution');
  }
  if (result.score.monotonicity >= 80) {
    reasons.push('Non-monotonic for balanced writes');
  }
  if (result.score.readTargeting >= 70) {
    reasons.push('Good read query targeting');
  }
  if (result.score.writeTargeting >= 70) {
    reasons.push('Good write query targeting');
  }

  return reasons;
}

export default router;
