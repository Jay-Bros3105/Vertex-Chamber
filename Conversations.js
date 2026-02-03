const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastRead: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    }
  }],
  type: {
    type: String,
    enum: ['direct', 'group', 'project', 'chamber'],
    default: 'direct'
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Conversation name cannot exceed 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  avatar: {
    type: String
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  chamber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chamber'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  settings: {
    allowNewMembers: {
      type: Boolean,
      default: true
    },
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowCodeSnippets: {
      type: Boolean,
      default: true
    },
    requireAdminForNewMembers: {
      type: Boolean,
      default: false
    },
    maxParticipants: {
      type: Number,
      default: 100
    }
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  },
  archivedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    archivedAt: Date
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for participant count
ConversationSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Virtual for active participant count
ConversationSchema.virtual('activeParticipantCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Virtual for last activity
ConversationSchema.virtual('lastActivity').get(async function() {
  if (this.lastMessage) {
    const Message = mongoose.model('Message');
    const message = await Message.findById(this.lastMessage);
    return message ? message.createdAt : this.updatedAt;
  }
  return this.updatedAt;
});

// Add participant to conversation
ConversationSchema.methods.addParticipant = async function(userId, addedBy) {
  const isParticipant = this.participants.some(participant => 
    participant.user.toString() === userId.toString()
  );
  
  if (!isParticipant) {
    if (this.participants.length >= this.settings.maxParticipants) {
      throw new Error('Maximum number of participants reached');
    }
    
    this.participants.push({
      user: userId,
      joinedAt: new Date(),
      addedBy
    });
    
    // Initialize unread count for new participant
    this.unreadCounts.set(userId.toString(), 0);
    
    await this.save();
    return true;
  }
  
  return false;
};

// Remove participant from conversation
ConversationSchema.methods.removeParticipant = async function(userId, removedBy) {
  const initialLength = this.participants.length;
  this.participants = this.participants.filter(participant => 
    participant.user.toString() !== userId.toString()
  );
  
  if (this.participants.length < initialLength) {
    // Remove unread count for removed participant
    this.unreadCounts.delete(userId.toString());
    
    // Archive conversation for removed user
    this.archivedBy.push({
      user: userId,
      archivedAt: new Date()
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Update last read timestamp for participant
ConversationSchema.methods.updateLastRead = async function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (participant) {
    participant.lastRead = new Date();
    // Reset unread count for this user
    this.unreadCounts.set(userId.toString(), 0);
    await this.save();
    return true;
  }
  
  return false;
};

// Increment unread count for all participants except sender
ConversationSchema.methods.incrementUnreadCounts = async function(senderId) {
  for (const participant of this.participants) {
    const participantId = participant.user.toString();
    
    if (participantId !== senderId.toString() && participant.notifications) {
      const currentCount = this.unreadCounts.get(participantId) || 0;
      this.unreadCounts.set(participantId, currentCount + 1);
    }
  }
  
  await this.save();
  return true;
};

// Get unread count for a specific user
ConversationSchema.methods.getUnreadCount = function(userId) {
  return this.unreadCounts.get(userId.toString()) || 0;
};

// Toggle participant notifications
ConversationSchema.methods.toggleNotifications = async function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (participant) {
    participant.notifications = !participant.notifications;
    await this.save();
    return participant.notifications;
  }
  
  return null;
};

// Archive conversation for user
ConversationSchema.methods.archiveForUser = async function(userId) {
  const alreadyArchived = this.archivedBy.some(archive => 
    archive.user.toString() === userId.toString()
  );
  
  if (!alreadyArchived) {
    this.archivedBy.push({
      user: userId,
      archivedAt: new Date()
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Unarchive conversation for user
ConversationSchema.methods.unarchiveForUser = async function(userId) {
  const initialLength = this.archivedBy.length;
  this.archivedBy = this.archivedBy.filter(archive => 
    archive.user.toString() !== userId.toString()
  );
  
  if (this.archivedBy.length < initialLength) {
    await this.save();
    return true;
  }
  
  return false;
};

// Check if conversation is archived for user
ConversationSchema.methods.isArchivedForUser = function(userId) {
  return this.archivedBy.some(archive => 
    archive.user.toString() === userId.toString()
  );
};

// Indexes for better query performance
ConversationSchema.index({ 'participants.user': 1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ project: 1 });
ConversationSchema.index({ chamber: 1 });
ConversationSchema.index({ createdAt: -1 });
ConversationSchema.index({ updatedAt: -1 });
ConversationSchema.index({ lastMessage: 1 });
ConversationSchema.index({ 'participants.user': 1, type: 1 });
ConversationSchema.index({ 'participants.user': 1, updatedAt: -1 });

const Conversation = mongoose.model('Conversation', ConversationSchema);

module.exports = Conversation;