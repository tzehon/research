/**
 * Validate MongoDB Atlas connection string
 */
export function validateConnectionString(connectionString) {
  const errors = [];

  if (!connectionString) {
    errors.push('Connection string is required');
    return { isValid: false, errors };
  }

  if (typeof connectionString !== 'string') {
    errors.push('Connection string must be a string');
    return { isValid: false, errors };
  }

  // Must be SRV format for Atlas
  if (!connectionString.startsWith('mongodb+srv://')) {
    errors.push('Connection string must use mongodb+srv:// format for Atlas clusters');
  }

  // Basic URL structure validation
  try {
    const url = new URL(connectionString.replace('mongodb+srv://', 'https://'));

    if (!url.username) {
      errors.push('Connection string must include a username');
    }

    if (!url.password) {
      errors.push('Connection string must include a password');
    }

    if (!url.hostname) {
      errors.push('Connection string must include a hostname');
    }
  } catch (e) {
    errors.push('Invalid connection string format');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate shard key specification
 */
export function validateShardKey(key) {
  const errors = [];

  if (!key) {
    errors.push('Shard key is required');
    return { isValid: false, errors };
  }

  if (typeof key !== 'object' || Array.isArray(key)) {
    errors.push('Shard key must be an object');
    return { isValid: false, errors };
  }

  const fields = Object.keys(key);

  if (fields.length === 0) {
    errors.push('Shard key must have at least one field');
    return { isValid: false, errors };
  }

  if (fields.length > 3) {
    errors.push('Shard key should not have more than 3 fields (best practice)');
  }

  // Validate each field
  for (const field of fields) {
    const value = key[field];

    // Check for valid shard key values: 1, -1, "hashed"
    if (value !== 1 && value !== -1 && value !== 'hashed') {
      errors.push(`Invalid value for field "${field}". Must be 1, -1, or "hashed"`);
    }

    // Can only have one hashed field
    if (value === 'hashed') {
      const hashedFields = fields.filter(f => key[f] === 'hashed');
      if (hashedFields.length > 1) {
        errors.push('Only one field can be hashed in a shard key');
      }
    }

    // Validate field name
    if (field.startsWith('$')) {
      errors.push(`Invalid field name "${field}". Field names cannot start with $`);
    }

    if (field.includes('\0')) {
      errors.push(`Invalid field name "${field}". Field names cannot contain null characters`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate namespace (database.collection)
 */
export function validateNamespace(database, collection) {
  const errors = [];

  if (!database) {
    errors.push('Database name is required');
  } else {
    // MongoDB database name restrictions
    if (typeof database !== 'string') {
      errors.push('Database name must be a string');
    } else {
      if (database.length === 0) {
        errors.push('Database name cannot be empty');
      }
      if (database.includes('/')) {
        errors.push('Database name cannot contain forward slash');
      }
      if (database.includes('\\')) {
        errors.push('Database name cannot contain backslash');
      }
      if (database.includes('.')) {
        errors.push('Database name cannot contain period');
      }
      if (database.includes(' ')) {
        errors.push('Database name cannot contain spaces');
      }
      if (database.includes('\0')) {
        errors.push('Database name cannot contain null characters');
      }
      if (database.length > 64) {
        errors.push('Database name cannot be longer than 64 characters');
      }
    }
  }

  if (!collection) {
    errors.push('Collection name is required');
  } else {
    if (typeof collection !== 'string') {
      errors.push('Collection name must be a string');
    } else {
      if (collection.length === 0) {
        errors.push('Collection name cannot be empty');
      }
      if (collection.includes('$')) {
        errors.push('Collection name cannot contain dollar sign');
      }
      if (collection.includes('\0')) {
        errors.push('Collection name cannot contain null characters');
      }
      if (collection.startsWith('system.')) {
        errors.push('Collection name cannot start with "system."');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate sampling configuration
 */
export function validateSamplingConfig(config) {
  const errors = [];

  const { samplesPerSecond } = config || {};

  if (samplesPerSecond !== undefined) {
    if (typeof samplesPerSecond !== 'number') {
      errors.push('samplesPerSecond must be a number');
    } else if (samplesPerSecond < 1 || samplesPerSecond > 50) {
      errors.push('samplesPerSecond must be between 1 and 50');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate workload configuration
 */
export function validateWorkloadConfig(config) {
  const errors = [];

  const { durationSeconds, queriesPerSecond, profile } = config || {};

  if (durationSeconds !== undefined) {
    if (typeof durationSeconds !== 'number') {
      errors.push('durationSeconds must be a number');
    } else if (durationSeconds < 10 || durationSeconds > 3600) {
      errors.push('durationSeconds must be between 10 and 3600 seconds');
    }
  }

  if (queriesPerSecond !== undefined) {
    if (typeof queriesPerSecond !== 'number') {
      errors.push('queriesPerSecond must be a number');
    } else if (queriesPerSecond < 1 || queriesPerSecond > 100) {
      errors.push('queriesPerSecond must be between 1 and 100');
    }
  }

  const validProfiles = ['ecommerce', 'social', 'custom'];
  if (profile && !validProfiles.includes(profile)) {
    errors.push(`Invalid profile. Must be one of: ${validProfiles.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate analysis configuration
 */
export function validateAnalysisConfig(config) {
  const errors = [];

  const { sampleSize, sampleRate, candidates } = config || {};

  if (sampleSize != null && sampleRate != null) {
    errors.push('Cannot specify both sampleSize and sampleRate');
  }

  if (sampleSize != null) {
    if (typeof sampleSize !== 'number') {
      errors.push('sampleSize must be a number');
    } else if (sampleSize < 100 || sampleSize > 1000000) {
      errors.push('sampleSize must be between 100 and 1,000,000');
    }
  }

  if (sampleRate != null) {
    if (typeof sampleRate !== 'number') {
      errors.push('sampleRate must be a number');
    } else if (sampleRate <= 0 || sampleRate > 1) {
      errors.push('sampleRate must be between 0 (exclusive) and 1 (inclusive)');
    }
  }

  if (candidates) {
    if (!Array.isArray(candidates)) {
      errors.push('candidates must be an array');
    } else {
      candidates.forEach((candidate, index) => {
        const keyValidation = validateShardKey(candidate.key);
        if (!keyValidation.isValid) {
          errors.push(`Candidate ${index + 1}: ${keyValidation.errors.join(', ')}`);
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default {
  validateConnectionString,
  validateShardKey,
  validateNamespace,
  validateSamplingConfig,
  validateWorkloadConfig,
  validateAnalysisConfig
};
