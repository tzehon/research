import { v4 as uuidv4 } from 'uuid';

// Sample data for social media dataset
const CATEGORIES = [
  'technology', 'sports', 'entertainment', 'news', 'lifestyle',
  'food', 'travel', 'music', 'gaming', 'education'
];

const VISIBILITY = ['public', 'friends', 'private'];

const HASHTAGS = [
  '#trending', '#viral', '#news', '#tech', '#sports', '#music',
  '#food', '#travel', '#gaming', '#art', '#photography', '#fitness',
  '#fashion', '#beauty', '#motivation', '#funny', '#memes', '#life'
];

const SAMPLE_CONTENT = [
  'Just had an amazing day! ☀️',
  'Check out this cool new tech gadget I found',
  'Working on an exciting new project',
  'Beautiful sunset today 🌅',
  'Who else is watching the game tonight?',
  'New recipe turned out great! 🍳',
  'Exploring a new city this weekend',
  'Finally finished that book I was reading',
  'Monday motivation: Keep pushing forward!',
  'Anyone else excited for the new release?',
  'Throwback to last summer ☀️',
  'Quick tip that changed my workflow',
  'Can\'t believe it\'s already Friday!',
  'Best coffee shop in town ☕',
  'Learning something new every day'
];

// Pre-generate user IDs for reuse
let userPool = [];

/**
 * Generate social media post documents
 */
export function generateSocialData(count, offset = 0) {
  const documents = [];

  // Initialize user pool on first call
  if (userPool.length === 0) {
    // Create ~20% of count as unique users
    const uniqueUsers = Math.floor(count * 0.2);
    for (let i = 0; i < Math.max(500, uniqueUsers); i++) {
      userPool.push({
        userId: uuidv4(),
        username: `user_${Math.random().toString(36).substring(2, 10)}`,
        followers: Math.floor(Math.random() * 10000),
        verified: Math.random() > 0.95
      });
    }
  }

  for (let i = 0; i < count; i++) {
    // Pick a user (weighted towards active users)
    const user = userPool[Math.floor(Math.pow(Math.random(), 0.7) * userPool.length)];

    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const visibility = VISIBILITY[Math.floor(Math.pow(Math.random(), 0.5) * VISIBILITY.length)]; // More public posts

    // Generate content
    const baseContent = SAMPLE_CONTENT[Math.floor(Math.random() * SAMPLE_CONTENT.length)];
    const numHashtags = Math.floor(Math.random() * 4);
    const hashtags = [];
    for (let j = 0; j < numHashtags; j++) {
      const tag = HASHTAGS[Math.floor(Math.random() * HASHTAGS.length)];
      if (!hashtags.includes(tag)) {
        hashtags.push(tag);
      }
    }
    const content = `${baseContent} ${hashtags.join(' ')}`.trim();

    // Generate timestamps (spread over last 30 days)
    const hoursAgo = Math.floor(Math.random() * 720); // 30 days * 24 hours
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    // Engagement metrics (correlate with user followers and post age)
    const engagementMultiplier = 1 + (user.followers / 10000);
    const ageMultiplier = 1 + (hoursAgo / 24); // Older posts have more engagement

    const baseLikes = Math.floor(Math.random() * 100 * engagementMultiplier * Math.sqrt(ageMultiplier));
    const likes = Math.min(baseLikes, user.followers * 0.3); // Cap at 30% of followers

    const commentCount = Math.floor(likes * (Math.random() * 0.1 + 0.01)); // 1-10% of likes
    const shareCount = Math.floor(likes * (Math.random() * 0.05)); // 0-5% of likes

    // Generate some comments
    const comments = [];
    const actualComments = Math.min(commentCount, 10); // Store max 10 comments
    for (let j = 0; j < actualComments; j++) {
      const commenter = userPool[Math.floor(Math.random() * userPool.length)];
      comments.push({
        commentId: uuidv4(),
        userId: commenter.userId,
        username: commenter.username,
        content: SAMPLE_CONTENT[Math.floor(Math.random() * SAMPLE_CONTENT.length)],
        createdAt: new Date(createdAt.getTime() + Math.random() * hoursAgo * 60 * 60 * 1000),
        likes: Math.floor(Math.random() * 20)
      });
    }

    // Mentions (random users)
    const mentions = [];
    if (Math.random() > 0.7) {
      const numMentions = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < numMentions; j++) {
        const mentioned = userPool[Math.floor(Math.random() * userPool.length)];
        if (mentioned.userId !== user.userId && !mentions.includes(mentioned.userId)) {
          mentions.push(mentioned.userId);
        }
      }
    }

    const post = {
      postId: uuidv4(),
      userId: user.userId,
      username: user.username,
      userVerified: user.verified,
      content,
      category,
      visibility,
      hashtags,
      mentions,
      mediaType: Math.random() > 0.6 ? (Math.random() > 0.7 ? 'video' : 'image') : 'text',
      likes,
      commentCount,
      shareCount,
      comments: comments.sort((a, b) => b.createdAt - a.createdAt),
      engagementRate: Math.round((likes + commentCount * 2 + shareCount * 3) / Math.max(user.followers, 1) * 10000) / 100,
      createdAt,
      updatedAt: comments.length > 0 ? comments[0].createdAt : createdAt,
      isEdited: Math.random() > 0.9,
      isPinned: Math.random() > 0.98,
      language: 'en',
      location: Math.random() > 0.8 ? {
        city: `City ${Math.floor(Math.random() * 100)}`,
        country: ['United States', 'United Kingdom', 'Canada', 'Australia'][Math.floor(Math.random() * 4)]
      } : null
    };

    documents.push(post);
  }

  return documents;
}

export default { generateSocialData };
