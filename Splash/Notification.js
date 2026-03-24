const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'project_invite',
      'chamber_invite',
      'task_assigned',
      'task_updated',
      'comment_on_project',
      'comment_on_task',
      'like_on_project',
      'like_on_feed',
      'mention',
      'message_received',
      'project_update',
      'chamber_announcement',
      'achievement_unlocked',
      'system_alert'
    ]
  },
  title: {
    type: String,
    required: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  data: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  relatedEntity: {
    type: {
      type: String,
      enum: ['project', 'chamber', 'task', 'feed', 'message', 'user', 'none']
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedEntity.type'
    }
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  actionRequired: {
    type: Boolean,
    default: false
  },
  actionTaken: {
    type: Boolean,
    default: false
  },
  actionTakenAt: Date,
  expiresAt: Date,
  metadata: {
    delivered: {
      type: Boolean,
      default: false
    },
    deliveredAt: Date,
    clicked: {
      type: Boolean,
      default: false
    },
    clickedAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for notification age
NotificationSchema.virtual('ageInHours').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diff = now - created;
  return Math.floor(diff / (1000 * 60 * 60));
});

// Virtual for isExpired
NotificationSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Virtual for isActionable
NotificationSchema.virtual('isActionable').get(function() {
  return this.actionRequired && !this.actionTaken;
});

// Mark as read
NotificationSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

// Mark as unread
NotificationSchema.methods.markAsUnread = async function() {
  if (this.isRead) {
    this.isRead = false;
    this.readAt = undefined;
    await this.save();
    return true;
  }
  return false;
};

// Archive notification
NotificationSchema.methods.archive = async function() {
  if (!this.isArchived) {
    this.isArchived = true;
    this.archivedAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

// Unarchive notification
NotificationSchema.methods.unarchive = async function() {
  if (this.isArchived) {
    this.isArchived = false;
    this.archivedAt = undefined;
    await this.save();
    return true;
  }
  return false;
};

// Mark action as taken
NotificationSchema.methods.markActionTaken = async function() {
  if (this.actionRequired && !this.actionTaken) {
    this.actionTaken = true;
    this.actionTakenAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

// Mark as delivered
NotificationSchema.methods.markAsDelivered = async function() {
  if (!this.metadata.delivered) {
    this.metadata.delivered = true;
    this.metadata.deliveredAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

// Mark as clicked
NotificationSchema.methods.markAsClicked = async function() {
  if (!this.metadata.clicked) {
    this.metadata.clicked = true;
    this.metadata.clickedAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

// Create notification (static method)
NotificationSchema.statics.createNotification = async function(notificationData) {
  const notification = new this(notificationData);
  await notification.save();
  
  // Emit socket event if user is online
  // This would be handled in socket handlers
  
  return notification;
};

// Get unread count for user
NotificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    user: userId,
    isRead: false,
    isArchived: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Clean up expired notifications
NotificationSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  return result.deletedCount;
};

// Indexes for better query performance
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ user: 1, isArchived: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ 'relatedEntity.id': 1 });
NotificationSchema.index({ 'relatedEntity.type': 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 });
NotificationSchema.index({ user: 1, priority: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;