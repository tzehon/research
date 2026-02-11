/**
 * Social media workload patterns
 * These patterns simulate realistic social media application query patterns
 */

export const socialWorkload = {
  name: 'Social Media',
  description: 'Simulates a social media platform with posts and engagement',
  patterns: [
    {
      name: 'Get user feed',
      description: 'Retrieve posts for a specific user',
      weight: 40,
      type: 'read',
      operation: 'find',
      filter: { userId: '{{userId}}' },
      options: { sort: { createdAt: -1 }, limit: 20 },
      notes: 'Most common query - loading user timeline/profile'
    },
    {
      name: 'Get post by ID',
      description: 'Look up a specific post',
      weight: 20,
      type: 'read',
      operation: 'find',
      filter: { postId: '{{postId}}' },
      notes: 'Permalink pages, notifications, sharing'
    },
    {
      name: 'Create new post',
      description: 'User creates a new post',
      weight: 15,
      type: 'write',
      operation: 'insert',
      document: {
        postId: '{{newPostId}}',
        userId: '{{userId}}',
        content: '{{content}}',
        createdAt: '{{now}}'
      },
      notes: 'User posting activity'
    },
    {
      name: 'Like post',
      description: 'Increment likes on a post',
      weight: 20,
      type: 'write',
      operation: 'update',
      filter: { postId: '{{postId}}' },
      update: { $inc: { likes: 1 } },
      notes: 'Engagement - most common write operation'
    },
    {
      name: 'Trending posts',
      description: 'Get trending posts across platform',
      weight: 5,
      type: 'read',
      operation: 'aggregate',
      pipeline: [
        { $match: { createdAt: { $gte: '{{dateFrom}}' }, visibility: 'public' } },
        { $sort: { likes: -1 } },
        { $limit: 10 }
      ],
      notes: 'Trending/explore page - scatter-gather is acceptable here'
    }
  ]
};

/**
 * Analysis notes for social media workload
 */
export const socialAnalysis = {
  bestCandidates: [
    {
      key: { userId: 1 },
      reasoning: [
        '40% of reads filter by userId (user feed)',
        'High cardinality - many distinct users',
        'Non-monotonic - user IDs are random',
        'All user posts co-located on same shard'
      ]
    },
    {
      key: { userId: 1, createdAt: 1 },
      reasoning: [
        'Supports user feed with time ordering',
        'Enables efficient "posts since X" queries',
        'Good for paginating user timeline'
      ]
    }
  ],
  worstCandidates: [
    {
      key: { category: 1 },
      reasoning: [
        'Only 10 distinct values',
        'Some categories much more popular (uneven distribution)',
        'Few queries filter by category alone'
      ]
    },
    {
      key: { visibility: 1 },
      reasoning: [
        'Only 3 distinct values',
        'Most posts are "public" - massive hotspot',
        'Terrible cardinality'
      ]
    },
    {
      key: { createdAt: 1 },
      reasoning: [
        'Monotonically increasing',
        'All new posts go to one shard',
        'Social media has very high write rates - instant bottleneck'
      ]
    }
  ]
};

export default { socialWorkload, socialAnalysis };
