const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a project name'],
    trim: true,
    maxlength: [100, 'Project name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true
  },
  description: {
    type: String,
    required: [true, 'Please provide a project description'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  team: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'contributor'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    skills: [{
      type: String,
      trim: true
    }]
  }],
  chambers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chamber'
  }],
  status: {
    type: String,
    enum: ['idea', 'planning', 'building', 'testing', 'launched', 'archived'],
    default: 'idea'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'chamber'],
    default: 'public'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  techStack: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    version: String,
    category: {
      type: String,
      enum: ['frontend', 'backend', 'database', 'devops', 'library', 'other']
    }
  }],
  repository: {
    type: String,
    trim: true,
    match: [/^https?:\/\/github\.com\/.+\/.+/, 'Please provide a valid GitHub repository URL']
  },
  website: {
    type: String,
    trim: true
  },
  bannerImage: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/w_1200,h_400,c_fill/default-banner.jpg'
  },
  logo: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/w_200,h_200,c_thumb/default-logo.png'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  milestones: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    dueDate: Date,
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    tasks: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }]
  }],
  stats: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    saves: {
      type: Number,
      default: 0
    },
    comments: {
      type: Number,
      default: 0
    },
    contributors: {
      type: Number,
      default: 0
    }
  },
  settings: {
    allowJoinRequests: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowPublicComments: {
      type: Boolean,
      default: true
    },
    allowTaskAssignment: {
      type: Boolean,
      default: true
    }
  },
  launchDate: Date,
  archivedAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for team count
ProjectSchema.virtual('teamCount').get(function() {
  return this.team.length;
});

// Virtual for active tasks count
ProjectSchema.virtual('activeTasksCount').get(async function() {
  const Task = mongoose.model('Task');
  const count = await Task.countDocuments({
    project: this._id,
    status: { $nin: ['completed', 'archived'] }
  });
  return count;
});

// Virtual for completed tasks count
ProjectSchema.virtual('completedTasksCount').get(async function() {
  const Task = mongoose.model('Task');
  const count = await Task.countDocuments({
    project: this._id,
    status: 'completed'
  });
  return count;
});

// Generate slug before saving
ProjectSchema.pre('save', async function(next) {
  if (!this.isModified('name')) return next();
  
  try {
    const baseSlug = this.name
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, '-');
    
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug exists
    const Project = mongoose.model('Project');
    while (await Project.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
    next();
  } catch (error) {
    next(error);
  }
});

// Add team member
ProjectSchema.methods.addTeamMember = async function(userId, role = 'member', skills = []) {
  const isMember = this.team.some(member => 
    member.user.toString() === userId.toString()
  );
  
  if (!isMember) {
    this.team.push({
      user: userId,
      role,
      skills,
      joinedAt: new Date()
    });
    
    this.stats.contributors += 1;
    await this.save();
    return true;
  }
  
  return false;
};

// Remove team member
ProjectSchema.methods.removeTeamMember = async function(userId) {
  const initialLength = this.team.length;
  this.team = this.team.filter(member => 
    member.user.toString() !== userId.toString()
  );
  
  if (this.team.length < initialLength) {
    this.stats.contributors = Math.max(0, this.stats.contributors - 1);
    await this.save();
    return true;
  }
  
  return false;
};

// Update progress based on milestones
ProjectSchema.methods.updateProgress = async function() {
  const completedMilestones = this.milestones.filter(m => m.completed).length;
  const totalMilestones = this.milestones.length;
  
  if (totalMilestones > 0) {
    this.progress = Math.round((completedMilestones / totalMilestones) * 100);
  } else {
    this.progress = 0;
  }
  
  await this.save();
  return this.progress;
};

// Add tag
ProjectSchema.methods.addTag = async function(tag) {
  const tagLower = tag.toLowerCase().trim();
  
  if (!this.tags.includes(tagLower)) {
    this.tags.push(tagLower);
    await this.save();
    return true;
  }
  
  return false;
};

// Remove tag
ProjectSchema.methods.removeTag = async function(tag) {
  const tagLower = tag.toLowerCase().trim();
  const initialLength = this.tags.length;
  
  this.tags = this.tags.filter(t => t !== tagLower);
  
  if (this.tags.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Increment view count
ProjectSchema.methods.incrementViews = async function() {
  this.stats.views += 1;
  await this.save();
  return this.stats.views;
};

// Increment like count
ProjectSchema.methods.incrementLikes = async function() {
  this.stats.likes += 1;
  await this.save();
  return this.stats.likes;
};

// Decrement like count
ProjectSchema.methods.decrementLikes = async function() {
  this.stats.likes = Math.max(0, this.stats.likes - 1);
  await this.save();
  return this.stats.likes;
};

// Indexes for better query performance
ProjectSchema.index({ slug: 1 }, { unique: true });
ProjectSchema.index({ owner: 1 });
ProjectSchema.index({ 'team.user': 1 });
ProjectSchema.index({ chambers: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ tags: 1 });
ProjectSchema.index({ createdAt: -1 });
ProjectSchema.index({ 'stats.likes': -1 });
ProjectSchema.index({ 'stats.views': -1 });

const Project = mongoose.model('Project', ProjectSchema);

module.exports = Project;