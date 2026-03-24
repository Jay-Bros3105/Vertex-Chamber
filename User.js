const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  avatar: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/w_100,h_100,c_thumb,g_face,r_20/default-avatar.jpg'
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
    default: 'Innovator'
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  location: {
    type: String,
    trim: true
  },
  skills: [{
    name: {
      type: String,
      trim: true,
      required: true
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'expert'],
      default: 'intermediate'
    }
  }],
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  badges: [{
    name: {
      type: String,
      required: true
    },
    icon: {
      type: String
    },
    description: {
      type: String
    },
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  chambers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chamber'
  }],
  projects: [{
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    role: {
      type: String,
      enum: ['owner', 'member', 'contributor'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      projectUpdates: {
        type: Boolean,
        default: true
      },
      messages: {
        type: Boolean,
        default: true
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'connections'],
        default: 'public'
      },
      showEmail: {
        type: Boolean,
        default: false
      },
      showLocation: {
        type: Boolean,
        default: true
      }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

// Virtual for projects count
UserSchema.virtual('projectsCount').get(function() {
  return this.projects.length;
});

// Virtual for launched projects count
UserSchema.virtual('launchedProjectsCount').get(async function() {
  const Project = mongoose.model('Project');
  const count = await Project.countDocuments({
    _id: { $in: this.projects.map(p => p.project) },
    status: 'launched'
  });
  return count;
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update last login on login
UserSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  this.loginCount += 1;
  await this.save();
};

// Generate JWT token
UserSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Match password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate email verification token
UserSchema.methods.generateEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Generate password reset token
UserSchema.methods.generateResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Add skill to user
UserSchema.methods.addSkill = async function(skillName, level = 'intermediate') {
  const skillExists = this.skills.some(skill => 
    skill.name.toLowerCase() === skillName.toLowerCase()
  );
  
  if (!skillExists) {
    this.skills.push({ name: skillName, level });
    await this.save();
    return true;
  }
  
  return false;
};

// Remove skill from user
UserSchema.methods.removeSkill = async function(skillName) {
  const initialLength = this.skills.length;
  this.skills = this.skills.filter(skill => 
    skill.name.toLowerCase() !== skillName.toLowerCase()
  );
  
  if (this.skills.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Add badge to user
UserSchema.methods.addBadge = async function(badgeName, icon, description) {
  const badgeExists = this.badges.some(badge => badge.name === badgeName);
  
  if (!badgeExists) {
    this.badges.push({ 
      name: badgeName, 
      icon, 
      description,
      earnedAt: new Date()
    });
    await this.save();
    return true;
  }
  
  return false;
};

// Indexes for better query performance
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'skills.name': 1 });
UserSchema.index({ 'projects.project': 1 });
UserSchema.index({ createdAt: -1 });

const User = mongoose.model('User', UserSchema);

module.exports = User;