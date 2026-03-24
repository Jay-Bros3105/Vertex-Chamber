const mongoose = require('mongoose');

const FeedItemSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'project_created',
      'project_updated',
      'project_launched',
      'task_created',
      'task_completed',
      'member_joined',
      'chamber_joined',
      'achievement_earned',
      'comment_added',
      'like_received',
      'trending_project',
      'weekly_digest'
    ]
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  chamber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chamber'
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  data: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  content: {
    type: String,
    maxlength: [500, 'Content cannot exceed 500 characters']
  },
  visibility: {
    type: String,
    enum: ['public', 'chamber', 'followers', 'private'],
    default: 'public'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [300, 'Comment cannot exceed 300 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: Date,
    likes: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      likedAt: {
        type: Date,
        default: Date.now
      }
    }],
    replies: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      content: {
        type: String,
        required: true,
        maxlength: [300, 'Reply cannot exceed 300 characters']
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: Date,
      likes: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        likedAt: {
          type: Date,
          default: Date.now
        }
      }]
    }]
  }],
  saves: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    savedAt: {
      type: Date,
      default: Date.now
    }
  }],
  shares: {
    count: {
      type: Number,
      default: 0
    },
    users: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      sharedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  engagementScore: {
    type: Number,
    default: 0
  },
  trendingScore: {
    type: Number,
    default: 0
  },
  expiresAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for like count
FeedItemSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Virtual for comment count
FeedItemSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Virtual for save count
FeedItemSchema.virtual('saveCount').get(function() {
  return this.saves.length;
});

// Virtual for total engagement
FeedItemSchema.virtual('totalEngagement').get(function() {
  return this.likeCount + this.commentCount + this.saveCount + this.shares.count;
});

// Calculate engagement score before saving
FeedItemSchema.pre('save', function(next) {
  // Calculate engagement score based on various factors
  const likeWeight = 1;
  const commentWeight = 3;
  const saveWeight = 2;
  const shareWeight = 5;
  const timeWeight = 0.1;
  
  const timeSinceCreation = (new Date() - this.createdAt) / (1000 * 60 * 60); // Hours
  
  this.engagementScore = (
    (this.likes.length * likeWeight) +
    (this.comments.length * commentWeight) +
    (this.saves.length * saveWeight) +
    (this.shares.count * shareWeight)
  ) / (1 + timeSinceCreation * timeWeight);
  
  // Calculate trending score (engagement per hour)
  if (timeSinceCreation > 0) {
    this.trendingScore = this.engagementScore / timeSinceCreation;
  }
  
  next();
});

// Add like to feed item
FeedItemSchema.methods.addLike = async function(userId) {
  const alreadyLiked = this.likes.some(like => 
    like.user.toString() === userId.toString()
  );
  
  if (!alreadyLiked) {
    this.likes.push({
      user: userId,
      likedAt: new Date()
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Remove like from feed item
FeedItemSchema.methods.removeLike = async function(userId) {
  const initialLength = this.likes.length;
  this.likes = this.likes.filter(like => 
    like.user.toString() !== userId.toString()
  );
  
  if (this.likes.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Add comment to feed item
FeedItemSchema.methods.addComment = async function(userId, content) {
  this.comments.push({
    user: userId,
    content,
    createdAt: new Date()
  });
  
  await this.save();
  return this.comments[this.comments.length - 1];
};

// Add reply to comment
FeedItemSchema.methods.addReplyToComment = async function(commentIndex, userId, content) {
  if (commentIndex >= 0 && commentIndex < this.comments.length) {
    this.comments[commentIndex].replies.push({
      user: userId,
      content,
      createdAt: new Date()
    });
    
    await this.save();
    return this.comments[commentIndex].replies[this.comments[commentIndex].replies.length - 1];
  }
  
  return null;
};

// Save feed item for user
FeedItemSchema.methods.saveForUser = async function(userId) {
  const alreadySaved = this.saves.some(save => 
    save.user.toString() === userId.toString()
  );
  
  if (!alreadySaved) {
    this.saves.push({
      user: userId,
      savedAt: new Date()
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Unsave feed item for user
FeedItemSchema.methods.unsaveForUser = async function(userId) {
  const initialLength = this.saves.length;
  this.saves = this.saves.filter(save => 
    save.user.toString() !== userId.toString()
  );
  
  if (this.saves.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Share feed item
FeedItemSchema.methods.share = async function(userId) {
  this.shares.count += 1;
  this.shares.users.push({
    user: userId,
    sharedAt: new Date()
  });
  
  await this.save();
  return this.shares.count;
};

// Add tag
FeedItemSchema.methods.addTag = async function(tag) {
  const tagLower = tag.toLowerCase().trim();
  
  if (!this.tags.includes(tagLower)) {
    this.tags.push(tagLower);
    await this.save();
    return true;
  }
  
  return false;
};

// Remove tag
FeedItemSchema.methods.removeTag = async function(tag) {
  const tagLower = tag.toLowerCase().trim();
  const initialLength = this.tags.length;
  
  this.tags = this.tags.filter(t => t !== tagLower);
  
  if (this.tags.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Check if user has liked the feed item
FeedItemSchema.methods.hasLiked = function(userId) {
  return this.likes.some(like => like.user.toString() === userId.toString());
};

// Check if user has saved the feed item
FeedItemSchema.methods.hasSaved = function(userId) {
  return this.saves.some(save => save.user.toString() === userId.toString());
};

// Indexes for better query performance
FeedItemSchema.index({ type: 1 });
FeedItemSchema.index({ user: 1 });
FeedItemSchema.index({ project: 1 });
FeedItemSchema.index({ chamber: 1 });
FeedItemSchema.index({ createdAt: -1 });
FeedItemSchema.index({ tags: 1 });
FeedItemSchema.index({ 'likes.user': 1 });
FeedItemSchema.index({ 'saves.user': 1 });
FeedItemSchema.index({ engagementScore: -1 });
FeedItemSchema.index({ trendingScore: -1 });
FeedItemSchema.index({ visibility: 1, createdAt: -1 });

const FeedItem = mongoose.model('FeedItem', FeedItemSchema);

module.exports = FeedItem;