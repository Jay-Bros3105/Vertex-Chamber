const mongoose = require('mongoose');

const SkillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide skill name'],
    unique: true,
    trim: true,
    lowercase: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: [
      'programming',
      'framework',
      'database',
      'devops',
      'design',
      'ai-ml',
      'blockchain',
      'mobile',
      'testing',
      'soft-skills',
      'other'
    ],
    default: 'programming'
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  icon: {
    type: String,
    default: 'fas fa-code'
  },
  color: {
    type: String,
    default: '#00D4FF'
  },
  popularity: {
    type: Number,
    default: 0,
    min: 0
  },
  usersCount: {
    type: Number,
    default: 0,
    min: 0
  },
  projectsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: Date,
  relatedSkills: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Skill'
  }],
  resources: [{
    title: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['documentation', 'tutorial', 'course', 'article', 'video'],
      default: 'documentation'
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
  trendingScore: {
    type: Number,
    default: 0
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

// Virtual for trending status
SkillSchema.virtual('isTrending').get(function() {
  return this.trendingScore > 50;
});

// Virtual for beginner friendly
SkillSchema.virtual('isBeginnerFriendly').get(function() {
  const beginnerFriendlyCategories = ['programming', 'soft-skills', 'design'];
  return beginnerFriendlyCategories.includes(this.category);
});

// Update popularity when user adds skill
SkillSchema.statics.incrementPopularity = async function(skillName) {
  await this.findOneAndUpdate(
    { name: skillName.toLowerCase() },
    { $inc: { popularity: 1, usersCount: 1 } }
  );
};

// Update projects count
SkillSchema.statics.incrementProjectsCount = async function(skillName) {
  await this.findOneAndUpdate(
    { name: skillName.toLowerCase() },
    { $inc: { projectsCount: 1 } }
  );
};

// Get trending skills
SkillSchema.statics.getTrending = async function(limit = 10) {
  return await this.find({ isActive: true })
    .sort({ trendingScore: -1, popularity: -1 })
    .limit(limit);
};

// Search skills
SkillSchema.statics.search = async function(query, limit = 20) {
  return await this.find({
    isActive: true,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { displayName: { $regex: query, $options: 'i' } }
    ]
  })
  .sort({ popularity: -1 })
  .limit(limit);
};

// Get skills by category
SkillSchema.statics.getByCategory = async function(category, limit = 50) {
  return await this.find({ 
    isActive: true, 
    category 
  })
  .sort({ popularity: -1 })
  .limit(limit);
};

// Indexes for better query performance
SkillSchema.index({ name: 1 }, { unique: true });
SkillSchema.index({ category: 1 });
SkillSchema.index({ popularity: -1 });
SkillSchema.index({ trendingScore: -1 });
SkillSchema.index({ usersCount: -1 });
SkillSchema.index({ createdAt: -1 });

const Skill = mongoose.model('Skill', SkillSchema);

module.exports = Skill;