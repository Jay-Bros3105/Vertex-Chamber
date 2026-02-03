const mongoose = require('mongoose');

const ChamberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a chamber name'],
    trim: true,
    maxlength: [50, 'Chamber name cannot exceed 50 characters'],
    unique: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true
  },
  description: {
    type: String,
    required: [true, 'Please provide a chamber description'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [150, 'Short description cannot exceed 150 characters']
  },
  icon: {
    type: String,
    default: 'fas fa-cube'
  },
  bannerImage: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/w_1200,h_300,c_fill/default-chamber-banner.jpg'
  },
  color: {
    primary: {
      type: String,
      default: '#00D4FF'
    },
    secondary: {
      type: String,
      default: '#8A2BE2'
    }
  },
  category: {
    type: String,
    enum: ['ai-ml', 'web-mobile', 'hardware-iot', 'blockchain', 'arvr', 'data-science', 'social-impact', 'other'],
    required: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  projects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  visibility: {
    type: String,
    enum: ['public', 'private', 'invite-only'],
    default: 'public'
  },
  rules: [{
    title: {
      type: String,
      required: true
    },
    description: String
  }],
  stats: {
    memberCount: {
      type: Number,
      default: 0
    },
    projectCount: {
      type: Number,
      default: 0
    },
    activeProjectCount: {
      type: Number,
      default: 0
    },
    launchedProjectCount: {
      type: Number,
      default: 0
    },
    discussionCount: {
      type: Number,
      default: 0
    },
    weeklyActivity: {
      type: Number,
      default: 0
    }
  },
  featuredProjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  resources: [{
    title: {
      type: String,
      required: true
    },
    description: String,
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['documentation', 'tutorial', 'tool', 'article', 'video'],
      default: 'article'
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  upcomingEvents: [{
    title: {
      type: String,
      required: true
    },
    description: String,
    date: {
      type: Date,
      required: true
    },
    type: {
      type: String,
      enum: ['workshop', 'hackathon', 'meetup', 'demo-day', 'webinar'],
      default: 'meetup'
    },
    isVirtual: {
      type: Boolean,
      default: true
    },
    location: String,
    link: String,
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  settings: {
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowProjectCreation: {
      type: Boolean,
      default: true
    },
    maxProjectsPerMember: {
      type: Number,
      default: 5
    },
    discussionCategories: [{
      type: String,
      default: ['General', 'Help', 'Showcase', 'Collaboration']
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for active members count
ChamberSchema.virtual('activeMembersCount').get(function() {
  return this.members.filter(member => member.isActive).length;
});

// Generate slug before saving
ChamberSchema.pre('save', async function(next) {
  if (!this.isModified('name')) return next();
  
  try {
    const baseSlug = this.name
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, '-');
    
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug exists
    const Chamber = mongoose.model('Chamber');
    while (await Chamber.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
    next();
  } catch (error) {
    next(error);
  }
});

// Add member to chamber
ChamberSchema.methods.addMember = async function(userId, role = 'member') {
  const isMember = this.members.some(member => 
    member.user.toString() === userId.toString()
  );
  
  if (!isMember) {
    this.members.push({
      user: userId,
      role,
      joinedAt: new Date()
    });
    
    this.stats.memberCount += 1;
    await this.save();
    return true;
  }
  
  return false;
};

// Remove member from chamber
ChamberSchema.methods.removeMember = async function(userId) {
  const initialLength = this.members.length;
  this.members = this.members.filter(member => 
    member.user.toString() !== userId.toString()
  );
  
  if (this.members.length < initialLength) {
    this.stats.memberCount = Math.max(0, this.stats.memberCount - 1);
    await this.save();
    return true;
  }
  
  return false;
};

// Add project to chamber
ChamberSchema.methods.addProject = async function(projectId) {
  if (!this.projects.includes(projectId)) {
    this.projects.push(projectId);
    this.stats.projectCount += 1;
    
    // Check if project is active
    const Project = mongoose.model('Project');
    const project = await Project.findById(projectId);
    
    if (project && project.status === 'launched') {
      this.stats.launchedProjectCount += 1;
    } else if (project && ['building', 'testing'].includes(project.status)) {
      this.stats.activeProjectCount += 1;
    }
    
    await this.save();
    return true;
  }
  
  return false;
};

// Remove project from chamber
ChamberSchema.methods.removeProject = async function(projectId) {
  const initialLength = this.projects.length;
  this.projects = this.projects.filter(id => id.toString() !== projectId.toString());
  
  if (this.projects.length < initialLength) {
    this.stats.projectCount = Math.max(0, this.stats.projectCount - 1);
    
    // Check if project was launched or active
    const Project = mongoose.model('Project');
    const project = await Project.findById(projectId);
    
    if (project && project.status === 'launched') {
      this.stats.launchedProjectCount = Math.max(0, this.stats.launchedProjectCount - 1);
    } else if (project && ['building', 'testing'].includes(project.status)) {
      this.stats.activeProjectCount = Math.max(0, this.stats.activeProjectCount - 1);
    }
    
    await this.save();
    return true;
  }
  
  return false;
};

// Update chamber stats
ChamberSchema.methods.updateStats = async function() {
  const Project = mongoose.model('Project');
  
  const activeProjects = await Project.countDocuments({
    _id: { $in: this.projects },
    status: { $in: ['building', 'testing'] }
  });
  
  const launchedProjects = await Project.countDocuments({
    _id: { $in: this.projects },
    status: 'launched'
  });
  
  this.stats.activeProjectCount = activeProjects;
  this.stats.launchedProjectCount = launchedProjects;
  this.stats.projectCount = this.projects.length;
  this.stats.memberCount = this.members.length;
  
  await this.save();
  return this.stats;
};

// Add tag
ChamberSchema.methods.addTag = async function(tag) {
  const tagLower = tag.toLowerCase().trim();
  
  if (!this.tags.includes(tagLower)) {
    this.tags.push(tagLower);
    await this.save();
    return true;
  }
  
  return false;
};

// Remove tag
ChamberSchema.methods.removeTag = async function(tag) {
  const tagLower = tag.toLowerCase().trim();
  const initialLength = this.tags.length;
  
  this.tags = this.tags.filter(t => t !== tagLower);
  
  if (this.tags.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Add resource
ChamberSchema.methods.addResource = async function(resourceData, addedBy) {
  this.resources.push({
    ...resourceData,
    addedBy,
    addedAt: new Date()
  });
  
  await this.save();
  return this.resources[this.resources.length - 1];
};

// Add event
ChamberSchema.methods.addEvent = async function(eventData, organizer) {
  this.upcomingEvents.push({
    ...eventData,
    organizer
  });
  
  await this.save();
  return this.upcomingEvents[this.upcomingEvents.length - 1];
};

// Indexes for better query performance
ChamberSchema.index({ slug: 1 }, { unique: true });
ChamberSchema.index({ name: 1 });
ChamberSchema.index({ category: 1 });
ChamberSchema.index({ tags: 1 });
ChamberSchema.index({ 'members.user': 1 });
ChamberSchema.index({ createdAt: -1 });
ChamberSchema.index({ 'stats.memberCount': -1 });
ChamberSchema.index({ 'stats.activeProjectCount': -1 });

const Chamber = mongoose.model('Chamber', ChamberSchema);

module.exports = Chamber;