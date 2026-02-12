/**
 * Social media workload patterns
 * These patterns simulate realistic social media application query patterns
 * with a mix of reads and writes that clearly favor userId as the shard key.
 */

export const socialWorkload = {
  name: 'Social Media',
  description: 'Simulates a social media platform with user-centric reads and writes',
  patterns: [
    {
      name: 'Get user feed',
      description: 'Retrieve posts for a specific user (profile / timeline)',
      weight: 25,
      type: 'read',
      operation: 'find',
      filter: { userId: '{{userId}}' },
      options: { sort: { createdAt: -1 }, limit: 20 },
      notes: 'Most common query - loading user profile or timeline'
    },
    {
      name: 'Create new post',
      description: 'User publishes a new post',
      weight: 15,
      type: 'write',
      operation: 'insert',
      document: {
        postId: '{{newPostId}}',
        userId: '{{userId}}',
        content: '{{content}}',
        category: '{{category}}',
        visibility: 'public',
        likes: 0,
        commentCount: 0,
        createdAt: '{{now}}'
      },
      notes: 'New post creation - always includes userId'
    },
    {
      name: 'Edit post',
      description: 'User edits their own post content',
      weight: 10,
      type: 'write',
      operation: 'update',
      filter: { userId: '{{userId}}', postId: '{{postId}}' },
      update: {
        $set: {
          content: '{{content}}',
          isEdited: true,
          updatedAt: '{{now}}'
        }
      },
      notes: 'Users can only edit their own posts - userId in filter'
    },
    {
      name: 'Delete post',
      description: 'User deletes their own post',
      weight: 5,
      type: 'write',
      operation: 'delete',
      filter: { userId: '{{userId}}', postId: '{{postId}}' },
      notes: 'Users can only delete their own posts - userId in filter'
    },
    {
      name: 'Get post by ID',
      description: 'Look up a specific post (permalink, notification link)',
      weight: 10,
      type: 'read',
      operation: 'find',
      filter: { postId: '{{postId}}' },
      notes: 'Permalink pages, shared links - no userId in filter'
    },
    {
      name: 'Like post',
      description: 'Increment likes on a post',
      weight: 10,
      type: 'write',
      operation: 'update',
      filter: { postId: '{{postId}}' },
      update: { $inc: { likes: 1 } },
      notes: 'Engagement action - targets postId only'
    },
    {
      name: 'Add comment',
      description: 'Add a comment to a user\'s post',
      weight: 10,
      type: 'write',
      operation: 'update',
      filter: { userId: '{{userId}}', postId: '{{postId}}' },
      update: {
        $push: {
          comments: {
            commentId: '{{newCommentId}}',
            userId: '{{commenterId}}',
            content: '{{content}}',
            createdAt: '{{now}}'
          }
        },
        $inc: { commentCount: 1 }
      },
      notes: 'Comment on post - includes post author userId in filter for routing'
    },
    {
      name: 'User engagement stats',
      description: 'Aggregate engagement metrics for a user (profile stats widget)',
      weight: 10,
      type: 'read',
      operation: 'aggregate',
      pipeline: [
        { $match: { userId: '{{userId}}' } },
        { $group: { _id: '$userId', totalLikes: { $sum: '$likes' }, totalPosts: { $sum: 1 }, avgLikes: { $avg: '$likes' } } }
      ],
      notes: 'User profile stats - targeted to a single user'
    },
    {
      name: 'Trending posts',
      description: 'Get trending posts across the platform (explore page)',
      weight: 5,
      type: 'read',
      operation: 'aggregate',
      pipeline: [
        { $match: { createdAt: { $gte: '{{dateFrom}}' }, visibility: 'public' } },
        { $sort: { likes: -1 } },
        { $limit: 10 }
      ],
      notes: 'Explore/trending page - scatter-gather is acceptable for global queries'
    }
  ]
};

/**
 * Analysis notes for social media workload
 *
 * Query targeting breakdown:
 *   userId in filter: 25% + 15% (insert) + 10% + 5% + 10% + 10% = 75%
 *   postId in filter: 10% + 10% + 10% + 5% + 10% = 45%
 *   no specific key:  5%
 *
 * Read/write split: 50% reads / 50% writes
 */
export const socialAnalysis = {
  bestCandidates: [
    {
      key: { userId: 1 },
      reasoning: [
        '75% of all operations (reads + writes) include userId',
        'High cardinality - thousands of distinct users',
        'Non-monotonic - user IDs are random UUIDs',
        'Good write distribution - posts spread evenly across users',
        'Co-locates all of a user\'s posts on the same shard (data locality for feeds)'
      ]
    },
    {
      key: { userId: 1, createdAt: 1 },
      reasoning: [
        'Supports user feed with efficient time-based ordering',
        'Enables efficient "posts since X" pagination queries',
        'Good compound key but slightly more complex than userId alone'
      ]
    }
  ],
  worstCandidates: [
    {
      key: { postId: 1 },
      reasoning: [
        'Only 45% of queries include postId in the filter',
        'Unique per post so no co-location benefit (each post isolated)',
        'User feed queries (25%) would scatter-gather across all shards',
        'User engagement stats (10%) would also scatter-gather'
      ]
    },
    {
      key: { category: 1 },
      reasoning: [
        'Only 10 distinct values',
        'Some categories much more popular (uneven distribution)',
        'Almost no queries filter by category'
      ]
    },
    {
      key: { visibility: 1 },
      reasoning: [
        'Only 3 distinct values',
        'Most posts are "public" - massive hotspot',
        'Terrible cardinality for sharding'
      ]
    },
    {
      key: { createdAt: 1 },
      reasoning: [
        'Monotonically increasing - all new posts go to one shard',
        'Social media has very high write rates - instant bottleneck',
        'Causes severe chunk imbalance over time'
      ]
    }
  ]
};

export default { socialWorkload, socialAnalysis };
