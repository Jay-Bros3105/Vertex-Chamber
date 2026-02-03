const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: [2000, 'Message content cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'code', 'system'],
    default: 'text'
  },
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'document', 'code', 'other']
    },
    size: Number
  }],
  codeSnippet: {
    language: String,
    code: String
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],
  repliedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  edited: {
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,
    previousContent: String
  },
  deleted: {
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  metadata: {
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for message status
MessageSchema.virtual('isRead').get(function() {
  return this.readBy.length > 0;
});

// Virtual for reaction count
MessageSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

// Mark message as read
MessageSchema.methods.markAsRead = async function(userId) {
  const alreadyRead = this.readBy.some(read => 
    read.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Add reaction to message
MessageSchema.methods.addReaction = async function(userId, emoji) {
  const existingReaction = this.reactions.find(reaction => 
    reaction.user.toString() === userId.toString() && 
    reaction.emoji === emoji
  );
  
  if (existingReaction) {
    // Remove reaction if it already exists
    this.reactions = this.reactions.filter(reaction => 
      !(reaction.user.toString() === userId.toString() && reaction.emoji === emoji)
    );
    await this.save();
    return 'removed';
  } else {
    // Add new reaction
    this.reactions.push({
      user: userId,
      emoji,
      reactedAt: new Date()
    });
    
    await this.save();
    return 'added';
  }
};

// Edit message
MessageSchema.methods.edit = async function(newContent, editedBy) {
  if (this.deleted.isDeleted) {
    throw new Error('Cannot edit a deleted message');
  }
  
  this.previousContent = this.content;
  this.content = newContent;
  this.edited = {
    isEdited: true,
    editedAt: new Date()
  };
  
  await this.save();
  return true;
};

// Soft delete message
MessageSchema.methods.softDelete = async function(deletedBy) {
  if (!this.deleted.isDeleted) {
    this.deleted = {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy
    };
    
    await this.save();
    return true;
  }
  
  return false;
};

// Add attachment to message
MessageSchema.methods.addAttachment = async function(filename, url, type, size) {
  this.attachments.push({
    filename,
    url,
    type,
    size
  });
  
  await this.save();
  return this.attachments[this.attachments.length - 1];
};

// Set code snippet
MessageSchema.methods.setCodeSnippet = async function(language, code) {
  this.codeSnippet = {
    language,
    code
  };
  
  await this.save();
  return this.codeSnippet;
};

// Indexes for better query performance
MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ 'readBy.user': 1 });
MessageSchema.index({ type: 1 });
MessageSchema.index({ conversation: 1, 'deleted.isDeleted': 1 });

const Message = mongoose.model('Message', MessageSchema);

module.exports = Message;