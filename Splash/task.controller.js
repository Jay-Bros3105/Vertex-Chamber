const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const FeedItem = require('../models/FeedItem');
const Notification = require('../models/Notification');

// @desc    Get all tasks
// @route   GET /api/v1/tasks
// @access  Private
exports.getTasks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      project,
      chamber,
      status,
      priority,
      assignedTo,
      createdBy,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Build query
    const query = { isActive: true };

    // Filter by project
    if (project) {
      const projectDoc = await Project.findOne({ slug: project });
      if (projectDoc) {
        query.project = projectDoc._id;
      }
    }

    // Filter by chamber
    if (chamber) {
      query.chamber = chamber;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by priority
    if (priority) {
      query.priority = priority;
    }

    // Filter by assigned user
    if (assignedTo) {
      if (assignedTo === 'me') {
        query['assignedTo.user'] = req.user.id;
      } else if (assignedTo === 'unassigned') {
        query.assignedTo = { $size: 0 };
      } else {
        query['assignedTo.user'] = assignedTo;
      }
    }

    // Filter by creator
    if (createdBy) {
      query.createdBy = createdBy;
    }

    // For regular users, only show tasks from projects they're members of
    if (req.user.role !== 'admin') {
      const userProjects = await Project.find({
        $or: [
          { owner: req.user.id },
          { 'team.user': req.user.id }
        ]
      }).select('_id');

      const projectIds = userProjects.map(p => p._id);
      query.project = { $in: projectIds };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Task.countDocuments(query);

    // Get tasks
    const tasks = await Task.find(query)
      .populate('project', 'name slug status')
      .populate('createdBy', 'username avatar')
      .populate('assignedTo.user', 'username avatar')
      .populate('comments.user', 'username avatar')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task
// @route   GET /api/v1/tasks/:id
// @access  Private
exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'name slug status owner team')
      .populate('createdBy', 'username firstName lastName avatar')
      .populate('assignedTo.user', 'username avatar title')
      .populate('comments.user', 'username avatar')
      .populate('dependencies', 'title status priority')
      .populate('attachments.uploadedBy', 'username avatar');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check access - user must be a member of the project
    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this task'
      });
    }

    res.status(200).json({
      success: true,
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new task
// @route   POST /api/v1/tasks
// @access  Private
exports.createTask = async (req, res, next) => {
  try {
    // Check if user has access to the project
    const project = await Project.findById(req.body.project);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create tasks in this project'
      });
    }

    // Add createdBy to req.body
    req.body.createdBy = req.user.id;

    // Create task
    const task = await Task.create(req.body);

    // Populate task
    const populatedTask = await Task.findById(task._id)
      .populate('project', 'name slug')
      .populate('createdBy', 'username avatar')
      .populate('assignedTo.user', 'username avatar');

    // Create feed item
    await FeedItem.create({
      type: 'task_created',
      user: req.user.id,
      project: project._id,
      task: task._id,
      content: `${req.user.username} created a new task: "${task.title}"`,
      visibility: project.visibility
    });

    // Create notifications for assigned users
    if (task.assignedTo && task.assignedTo.length > 0) {
      const notificationPromises = task.assignedTo.map(async (assignment) => {
        if (assignment.user.toString() !== req.user.id) {
          await Notification.create({
            user: assignment.user,
            type: 'task_assigned',
            title: 'New Task Assigned',
            message: `${req.user.username} assigned you a task: "${task.title}"`,
            data: { taskId: task._id, projectId: project._id },
            relatedEntity: { type: 'task', id: task._id },
            sender: req.user.id
          });
        }
      });

      await Promise.all(notificationPromises);
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task
// @route   PUT /api/v1/tasks/:id
// @access  Private
exports.updateTask = async (req, res, next) => {
  try {
    let task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin', 'member'].includes(member.role)
    );
    const isOwner = project.owner.toString() === req.user.id;
    const isAssigned = task.assignedTo.some(assignment => 
      assignment.user.toString() === req.user.id
    );
    const isCreator = task.createdBy.toString() === req.user.id;

    // Check permissions based on what's being updated
    const canUpdate = isTeamMember || isOwner || isCreator || req.user.role === 'admin';
    
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this task'
      });
    }

    // Special permissions for certain fields
    if (req.body.status && !isTeamMember && !isOwner && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update task status'
      });
    }

    if (req.body.assignedTo && !isTeamMember && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to assign tasks'
      });
    }

    // Store old status for notification
    const oldStatus = task.status;

    // Update task
    task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
    .populate('project', 'name slug')
    .populate('createdBy', 'username avatar')
    .populate('assignedTo.user', 'username avatar');

    // If status changed, create notification and feed item
    if (req.body.status && req.body.status !== oldStatus) {
      // Create feed item for status change
      await FeedItem.create({
        type: 'task_updated',
        user: req.user.id,
        project: project._id,
        task: task._id,
        content: `${req.user.username} changed task status from "${oldStatus}" to "${req.body.status}"`,
        visibility: project.visibility
      });

      // Create notification for task creator and assignees
      const notifyUsers = new Set();
      notifyUsers.add(task.createdBy.toString());
      
      task.assignedTo.forEach(assignment => {
        notifyUsers.add(assignment.user.toString());
      });

      const notificationPromises = Array.from(notifyUsers).map(async (userId) => {
        if (userId !== req.user.id) {
          await Notification.create({
            user: userId,
            type: 'task_updated',
            title: 'Task Updated',
            message: `${req.user.username} updated task: "${task.title}"`,
            data: { 
              taskId: task._id, 
              projectId: project._id,
              oldStatus,
              newStatus: req.body.status 
            },
            relatedEntity: { type: 'task', id: task._id },
            sender: req.user.id
          });
        }
      });

      await Promise.all(notificationPromises);
    }

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete task
// @route   DELETE /api/v1/tasks/:id
// @access  Private
exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamAdmin = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin'].includes(member.role)
    );
    const isOwner = project.owner.toString() === req.user.id;
    const isCreator = task.createdBy.toString() === req.user.id;

    if (!isTeamAdmin && !isOwner && !isCreator && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this task'
      });
    }

    // Soft delete
    task.isActive = false;
    await task.save();

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign task to user
// @route   POST /api/v1/tasks/:id/assign
// @access  Private
exports.assignTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin', 'member'].includes(member.role)
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to assign this task'
      });
    }

    const { userId } = req.body;

    // Check if user is a member of the project
    const isUserInProject = project.team.some(member => 
      member.user.toString() === userId
    ) || project.owner.toString() === userId;

    if (!isUserInProject) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this project'
      });
    }

    // Assign task
    const assigned = await task.addAssignee(userId, req.user.id);

    if (!assigned) {
      return res.status(400).json({
        success: false,
        message: 'User is already assigned to this task'
      });
    }

    // Create notification for the assigned user
    if (userId !== req.user.id) {
      await Notification.create({
        user: userId,
        type: 'task_assigned',
        title: 'Task Assigned',
        message: `${req.user.username} assigned you a task: "${task.title}"`,
        data: { taskId: task._id, projectId: project._id },
        relatedEntity: { type: 'task', id: task._id },
        sender: req.user.id
      });
    }

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo.user', 'username avatar');

    res.status(200).json({
      success: true,
      message: 'Task assigned successfully',
      assignedTo: updatedTask.assignedTo
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Unassign task from user
// @route   DELETE /api/v1/tasks/:id/assign/:userId
// @access  Private
exports.unassignTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin'].includes(member.role)
    );
    const isOwner = project.owner.toString() === req.user.id;
    const isAssignedUser = req.params.userId === req.user.id;

    if (!isTeamMember && !isOwner && !isAssignedUser && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to unassign this task'
      });
    }

    const { userId } = req.params;

    // Unassign task
    const unassigned = await task.removeAssignee(userId, req.user.id);

    if (!unassigned) {
      return res.status(400).json({
        success: false,
        message: 'User is not assigned to this task'
      });
    }

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo.user', 'username avatar');

    res.status(200).json({
      success: true,
      message: 'Task unassigned successfully',
      assignedTo: updatedTask.assignedTo
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add comment to task
// @route   POST /api/v1/tasks/:id/comments
// @access  Private
exports.addComment = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to comment on this task'
      });
    }

    const { content, attachments = [] } = req.body;

    // Add comment
    const comment = await task.addComment(req.user.id, content, attachments);

    // Create notifications for task creator and assignees
    const notifyUsers = new Set();
    notifyUsers.add(task.createdBy.toString());
    
    task.assignedTo.forEach(assignment => {
      notifyUsers.add(assignment.user.toString());
    });

    // Don't notify the commenter
    notifyUsers.delete(req.user.id);

    const notificationPromises = Array.from(notifyUsers).map(async (userId) => {
      await Notification.create({
        user: userId,
        type: 'comment_on_task',
        title: 'New Comment on Task',
        message: `${req.user.username} commented on task: "${task.title}"`,
        data: { taskId: task._id, projectId: project._id, commentId: comment._id },
        relatedEntity: { type: 'task', id: task._id },
        sender: req.user.id
      });
    });

    await Promise.all(notificationPromises);

    // Get updated task with populated comments
    const updatedTask = await Task.findById(task._id)
      .populate('comments.user', 'username avatar')
      .populate('comments.attachments');

    res.status(200).json({
      success: true,
      message: 'Comment added successfully',
      comments: updatedTask.comments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task status
// @route   PUT /api/v1/tasks/:id/status
// @access  Private
exports.updateStatus = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;
    const isAssigned = task.assignedTo.some(assignment => 
      assignment.user.toString() === req.user.id
    );

    if (!isTeamMember && !isOwner && !isAssigned && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update task status'
      });
    }

    const { status } = req.body;

    if (!['todo', 'in-progress', 'review', 'completed', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Update status
    await task.updateStatus(status, req.user.id);

    // If task is completed, create feed item
    if (status === 'completed') {
      await FeedItem.create({
        type: 'task_completed',
        user: req.user.id,
        project: project._id,
        task: task._id,
        content: `${req.user.username} completed the task: "${task.title}"`,
        visibility: project.visibility
      });
    }

    const updatedTask = await Task.findById(task._id)
      .populate('project', 'name slug');

    res.status(200).json({
      success: true,
      message: 'Task status updated successfully',
      task: updatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add attachment to task
// @route   POST /api/v1/tasks/:id/attachments
// @access  Private
exports.addAttachment = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add attachments to this task'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { filename, path: url, mimetype, size } = req.file;

    // Determine file type
    let type = 'other';
    if (mimetype.startsWith('image/')) type = 'image';
    else if (mimetype === 'application/pdf') type = 'document';
    else if (mimetype.includes('text') || mimetype.includes('code')) type = 'code';

    // Add attachment
    const attachment = await task.addAttachment(filename, url, type, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Attachment added successfully',
      attachment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add subtask
// @route   POST /api/v1/tasks/:id/subtasks
// @access  Private
exports.addSubtask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;
    const isAssigned = task.assignedTo.some(assignment => 
      assignment.user.toString() === req.user.id
    );

    if (!isTeamMember && !isOwner && !isAssigned && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add subtasks to this task'
      });
    }

    const { title } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide subtask title'
      });
    }

    // Add subtask
    const subtask = await task.addSubtask(title);

    res.status(200).json({
      success: true,
      message: 'Subtask added successfully',
      subtask,
      subtasks: task.subtasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle subtask completion
// @route   PUT /api/v1/tasks/:id/subtasks/:subtaskIndex
// @access  Private
exports.toggleSubtask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'owner team');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const project = task.project;
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;
    const isAssigned = task.assignedTo.some(assignment => 
      assignment.user.toString() === req.user.id
    );

    if (!isTeamMember && !isOwner && !isAssigned && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update subtasks'
      });
    }

    const subtaskIndex = parseInt(req.params.subtaskIndex);

    // Toggle subtask
    const toggled = await task.toggleSubtask(subtaskIndex);

    if (!toggled) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subtask index'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Subtask updated successfully',
      subtasks: task.subtasks
    });
  } catch (error) {
    next(error);
  }
};