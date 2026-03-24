const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a task title'],
    trim: true,
    maxlength: [200, 'Task title cannot exceed 200 characters']
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  chamber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chamber'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'review', 'completed', 'archived'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  labels: [{
    type: String,
    trim: true
  }],
  dueDate: Date,
  completedAt: Date,
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  dependencies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  subtasks: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date
  }],
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
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
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
      maxlength: [500, 'Comment cannot exceed 500 characters']
    },
    attachments: [{
      filename: String,
      url: String,
      type: String
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: Date
  }],
  activityLog: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'assigned', 'status-changed', 'commented', 'attachment-added']
    },
    details: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    allowComments: {
      type: Boolean,
      default: true
    },
    allowAttachmentUploads: {
      type: Boolean,
      default: true
    },
    notifyOnUpdate: {
      type: Boolean,
      default: true
    }
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

// Virtual for completion percentage based on subtasks
TaskSchema.virtual('completionPercentage').get(function() {
  if (this.subtasks.length === 0) {
    return this.status === 'completed' ? 100 : 0;
  }
  
  const completedSubtasks = this.subtasks.filter(subtask => subtask.completed).length;
  return Math.round((completedSubtasks / this.subtasks.length) * 100);
});

// Virtual for overdue status
TaskSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === 'completed') return false;
  return new Date() > this.dueDate;
});

// Virtual for days remaining
TaskSchema.virtual('daysRemaining').get(function() {
  if (!this.dueDate || this.status === 'completed') return null;
  
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
});

// Log activity before saving
TaskSchema.pre('save', function(next) {
  if (this.isNew) {
    this.activityLog.push({
      user: this.createdBy,
      action: 'created',
      details: 'Task created'
    });
  }
  
  next();
});

// Add assignee to task
TaskSchema.methods.addAssignee = async function(userId, assignedBy) {
  const isAssigned = this.assignedTo.some(assignment => 
    assignment.user.toString() === userId.toString()
  );
  
  if (!isAssigned) {
    this.assignedTo.push({
      user: userId,
      assignedBy,
      assignedAt: new Date()
    });
    
    this.activityLog.push({
      user: assignedBy,
      action: 'assigned',
      details: `Assigned to user ${userId}`
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Remove assignee from task
TaskSchema.methods.removeAssignee = async function(userId, removedBy) {
  const initialLength = this.assignedTo.length;
  this.assignedTo = this.assignedTo.filter(assignment => 
    assignment.user.toString() !== userId.toString()
  );
  
  if (this.assignedTo.length < initialLength) {
    this.activityLog.push({
      user: removedBy,
      action: 'updated',
      details: `Removed user ${userId} from assignees`
    });
    
    await this.save();
    return true;
  }
  
  return false;
};

// Update task status
TaskSchema.methods.updateStatus = async function(newStatus, updatedBy) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  if (newStatus === 'completed') {
    this.completedAt = new Date();
  }
  
  this.activityLog.push({
    user: updatedBy,
    action: 'status-changed',
    details: `Status changed from ${oldStatus} to ${newStatus}`
  });
  
  await this.save();
  return true;
};

// Add comment to task
TaskSchema.methods.addComment = async function(userId, content, attachments = []) {
  this.comments.push({
    user: userId,
    content,
    attachments,
    createdAt: new Date()
  });
  
  this.activityLog.push({
    user: userId,
    action: 'commented',
    details: 'Added a comment'
  });
  
  await this.save();
  return this.comments[this.comments.length - 1];
};

// Add attachment to task
TaskSchema.methods.addAttachment = async function(filename, url, type, uploadedBy) {
  this.attachments.push({
    filename,
    url,
    type,
    uploadedBy,
    uploadedAt: new Date()
  });
  
  this.activityLog.push({
    user: uploadedBy,
    action: 'attachment-added',
    details: `Added attachment: ${filename}`
  });
  
  await this.save();
  return this.attachments[this.attachments.length - 1];
};

// Add subtask
TaskSchema.methods.addSubtask = async function(title) {
  this.subtasks.push({
    title,
    completed: false
  });
  
  await this.save();
  return this.subtasks[this.subtasks.length - 1];
};

// Toggle subtask completion
TaskSchema.methods.toggleSubtask = async function(subtaskIndex) {
  if (subtaskIndex >= 0 && subtaskIndex < this.subtasks.length) {
    this.subtasks[subtaskIndex].completed = !this.subtasks[subtaskIndex].completed;
    
    if (this.subtasks[subtaskIndex].completed) {
      this.subtasks[subtaskIndex].completedAt = new Date();
    } else {
      this.subtasks[subtaskIndex].completedAt = undefined;
    }
    
    await this.save();
    return true;
  }
  
  return false;
};

// Update actual hours
TaskSchema.methods.logHours = async function(hours) {
  this.actualHours = (this.actualHours || 0) + hours;
  await this.save();
  return this.actualHours;
};

// Indexes for better query performance
TaskSchema.index({ project: 1 });
TaskSchema.index({ chamber: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ 'assignedTo.user': 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ priority: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ project: 1, priority: 1 });

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;