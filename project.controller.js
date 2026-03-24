const Project = require('../models/Project');
const User = require('../models/User');
const Chamber = require('../models/Chamber');
const Task = require('../models/Task');
const FeedItem = require('../models/FeedItem');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// @desc    Get all projects
// @route   GET /api/v1/projects
// @access  Public
exports.getProjects = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      status,
      chamber,
      tags,
      owner,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Build query
    const query = { isActive: true };

    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by chamber
    if (chamber) {
      const chamberDoc = await Chamber.findOne({ slug: chamber });
      if (chamberDoc) {
        query.chambers = chamberDoc._id;
      }
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    // Filter by owner
    if (owner) {
      const ownerDoc = await User.findOne({ username: owner });
      if (ownerDoc) {
        query.owner = ownerDoc._id;
      }
    }

    // Apply visibility filter for non-admin users
    if (!req.user || req.user.role !== 'admin') {
      query.$or = [
        { visibility: 'public' },
        { visibility: 'chamber' },
        { owner: req.user?._id },
        { 'team.user': req.user?._id }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Project.countDocuments(query);

    // Sorting
    let sort = {};
    if (sortBy === 'popular') {
      sort = { 'stats.likes': -1, 'stats.views': -1 };
    } else if (sortBy === 'trending') {
      sort = { 'stats.views': -1, createdAt: -1 };
    } else if (sortBy === 'recent') {
      sort = { createdAt: -1 };
    } else if (sortBy === 'progress') {
      sort = { progress: -1 };
    } else {
      sort = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    // Get projects
    const projects = await Project.find(query)
      .populate('owner', 'username firstName lastName avatar title')
      .populate('team.user', 'username avatar')
      .populate('chambers', 'name slug icon')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: projects.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      projects
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single project
// @route   GET /api/v1/projects/:id
// @access  Public
exports.getProject = async (req, res, next) => {
  try {
    let project;
    
    // Check if param is slug
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      project = await Project.findOne({ _id: req.params.id, isActive: true })
        .populate('owner', 'username firstName lastName avatar title bio')
        .populate('team.user', 'username firstName lastName avatar title skills')
        .populate('chambers', 'name slug icon description')
        .populate('milestones.tasks', 'title status priority dueDate');
    } else {
      project = await Project.findOne({ slug: req.params.id, isActive: true })
        .populate('owner', 'username firstName lastName avatar title bio')
        .populate('team.user', 'username firstName lastName avatar title skills')
        .populate('chambers', 'name slug icon description')
        .populate('milestones.tasks', 'title status priority dueDate');
    }

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check visibility
    const isOwner = req.user && project.owner._id.toString() === req.user.id;
    const isTeamMember = req.user && project.team.some(member => 
      member.user._id.toString() === req.user.id
    );
    const isAdmin = req.user && req.user.role === 'admin';

    if (project.visibility === 'private' && !isOwner && !isTeamMember && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'This project is private'
      });
    }

    if (project.visibility === 'chamber' && !isOwner && !isTeamMember && !isAdmin) {
      const userChambers = req.user ? req.user.chambers.map(c => c.toString()) : [];
      const hasAccess = project.chambers.some(chamber => 
        userChambers.includes(chamber._id.toString())
      );
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'This project is only accessible to chamber members'
        });
      }
    }

    // Increment view count
    if (!isOwner && !isTeamMember) {
      await project.incrementViews();
    }

    res.status(200).json({
      success: true,
      project
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new project
// @route   POST /api/v1/projects
// @access  Private
exports.createProject = async (req, res, next) => {
  try {
    // Add owner to req.body
    req.body.owner = req.user.id;
    
    // Create project
    const project = await Project.create(req.body);

    // Add owner to team
    await project.addTeamMember(req.user.id, 'owner', req.user.skills.map(s => s.name));

    // Add project to user's projects
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        projects: {
          project: project._id,
          role: 'owner'
        }
      }
    });

    // Create feed item
    await FeedItem.create({
      type: 'project_created',
      user: req.user.id,
      project: project._id,
      content: `${req.user.username} created a new project: ${project.name}`,
      visibility: project.visibility
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update project
// @route   PUT /api/v1/projects/:id
// @access  Private (owner or admin)
exports.updateProject = async (req, res, next) => {
  try {
    let project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check ownership or admin rights
    const isOwner = project.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isTeamAdmin = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin'].includes(member.role)
    );

    if (!isOwner && !isAdmin && !isTeamAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this project'
      });
    }

    // Update project
    project = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
    .populate('owner', 'username avatar')
    .populate('team.user', 'username avatar')
    .populate('chambers', 'name slug');

    // If status changed to launched, create feed item
    if (req.body.status === 'launched' && project.status === 'launched') {
      await FeedItem.create({
        type: 'project_launched',
        user: req.user.id,
        project: project._id,
        content: `${req.user.username} launched the project: ${project.name}`,
        visibility: 'public'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      project
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete project
// @route   DELETE /api/v1/projects/:id
// @access  Private (owner or admin)
exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check ownership or admin rights
    const isOwner = project.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this project'
      });
    }

    // Soft delete (deactivate)
    project.isActive = false;
    await project.save();

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add team member
// @route   POST /api/v1/projects/:id/team
// @access  Private (owner or admin)
exports.addTeamMember = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check permissions
    const isOwner = project.owner.toString() === req.user.id;
    const isTeamAdmin = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin'].includes(member.role)
    );

    if (!isOwner && !isTeamAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add team members'
      });
    }

    const { userId, role = 'member', skills = [] } = req.body;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add team member
    const added = await project.addTeamMember(userId, role, skills);

    if (!added) {
      return res.status(400).json({
        success: false,
        message: 'User is already a team member'
      });
    }

    // Add project to user's projects
    await User.findByIdAndUpdate(userId, {
      $push: {
        projects: {
          project: project._id,
          role
        }
      }
    });

    // Create notification
    await Notification.create({
      user: userId,
      type: 'project_invite',
      title: 'Project Invitation',
      message: `${req.user.username} invited you to join "${project.name}"`,
      data: { projectId: project._id, role },
      relatedEntity: { type: 'project', id: project._id },
      sender: req.user.id
    });

    // Create feed item
    await FeedItem.create({
      type: 'member_joined',
      user: userId,
      project: project._id,
      content: `${user.username} joined the project "${project.name}"`,
      visibility: project.visibility
    });

    const updatedProject = await Project.findById(req.params.id)
      .populate('team.user', 'username avatar title skills');

    res.status(200).json({
      success: true,
      message: 'Team member added successfully',
      team: updatedProject.team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove team member
// @route   DELETE /api/v1/projects/:id/team/:userId
// @access  Private (owner or admin)
exports.removeTeamMember = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check permissions
    const isOwner = project.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove team members'
      });
    }

    const { userId } = req.params;

    // Cannot remove owner
    if (project.owner.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove project owner'
      });
    }

    // Remove team member
    const removed = await project.removeTeamMember(userId);

    if (!removed) {
      return res.status(400).json({
        success: false,
        message: 'User is not a team member'
      });
    }

    // Remove project from user's projects
    await User.findByIdAndUpdate(userId, {
      $pull: {
        projects: { project: project._id }
      }
    });

    const updatedProject = await Project.findById(req.params.id)
      .populate('team.user', 'username avatar');

    res.status(200).json({
      success: true,
      message: 'Team member removed successfully',
      team: updatedProject.team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update team member role
// @route   PUT /api/v1/projects/:id/team/:userId/role
// @access  Private (owner or admin)
exports.updateTeamMemberRole = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check permissions
    const isOwner = project.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update team member roles'
      });
    }

    const { userId } = req.params;
    const { role } = req.body;

    // Find team member
    const teamMemberIndex = project.team.findIndex(member => 
      member.user.toString() === userId
    );

    if (teamMemberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Update role
    project.team[teamMemberIndex].role = role;
    await project.save();

    // Update user's project role
    await User.updateOne(
      { _id: userId, 'projects.project': project._id },
      { $set: { 'projects.$.role': role } }
    );

    const updatedProject = await Project.findById(req.params.id)
      .populate('team.user', 'username avatar');

    res.status(200).json({
      success: true,
      message: 'Team member role updated successfully',
      team: updatedProject.team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Like project
// @route   POST /api/v1/projects/:id/like
// @access  Private
exports.likeProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check if user already liked
    const hasLiked = project.stats.likes > 0; // Simplified check
    
    if (hasLiked) {
      // Unlike
      await project.decrementLikes();
      
      res.status(200).json({
        success: true,
        message: 'Project unliked',
        likes: project.stats.likes
      });
    } else {
      // Like
      await project.incrementLikes();
      
      // Create notification for project owner
      if (project.owner.toString() !== req.user.id) {
        await Notification.create({
          user: project.owner,
          type: 'like_on_project',
          title: 'Project Liked',
          message: `${req.user.username} liked your project "${project.name}"`,
          data: { projectId: project._id },
          relatedEntity: { type: 'project', id: project._id },
          sender: req.user.id
        });
      }
      
      // Create feed item
      await FeedItem.create({
        type: 'like_received',
        user: req.user.id,
        project: project._id,
        content: `${req.user.username} liked the project "${project.name}"`,
        visibility: 'public'
      });

      res.status(200).json({
        success: true,
        message: 'Project liked',
        likes: project.stats.likes
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Add project to chamber
// @route   POST /api/v1/projects/:id/chambers/:chamberId
// @access  Private (project owner or admin)
exports.addToChamber = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    const chamber = await Chamber.findById(req.params.chamberId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!chamber) {
      return res.status(404).json({
        success: false,
        message: 'Chamber not found'
      });
    }

    // Check permissions
    const isProjectOwner = project.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isChamberAdmin = chamber.admins.includes(req.user.id);

    if (!isProjectOwner && !isAdmin && !isChamberAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add project to chamber'
      });
    }

    // Check if project already in chamber
    if (project.chambers.includes(chamber._id)) {
      return res.status(400).json({
        success: false,
        message: 'Project is already in this chamber'
      });
    }

    // Add to project chambers
    project.chambers.push(chamber._id);
    await project.save();

    // Add to chamber projects
    await chamber.addProject(project._id);

    res.status(200).json({
      success: true,
      message: 'Project added to chamber successfully',
      chambers: project.chambers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove project from chamber
// @route   DELETE /api/v1/projects/:id/chambers/:chamberId
// @access  Private (project owner or admin)
exports.removeFromChamber = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    const chamber = await Chamber.findById(req.params.chamberId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!chamber) {
      return res.status(404).json({
        success: false,
        message: 'Chamber not found'
      });
    }

    // Check permissions
    const isProjectOwner = project.owner.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isChamberAdmin = chamber.admins.includes(req.user.id);

    if (!isProjectOwner && !isAdmin && !isChamberAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove project from chamber'
      });
    }

    // Remove from project chambers
    project.chambers = project.chambers.filter(
      chamberId => chamberId.toString() !== chamber._id.toString()
    );
    await project.save();

    // Remove from chamber projects
    await chamber.removeProject(project._id);

    res.status(200).json({
      success: true,
      message: 'Project removed from chamber successfully',
      chambers: project.chambers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get project tasks
// @route   GET /api/v1/projects/:id/tasks
// @access  Private (team members)
exports.getProjectTasks = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view project tasks'
      });
    }

    const { status, assignedTo, priority, page = 1, limit = 20 } = req.query;

    const query = { project: project._id, isActive: true };

    if (status) query.status = status;
    if (assignedTo) query['assignedTo.user'] = assignedTo;
    if (priority) query.priority = priority;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await Task.countDocuments(query);

    const tasks = await Task.find(query)
      .populate('createdBy', 'username avatar')
      .populate('assignedTo.user', 'username avatar')
      .populate('comments.user', 'username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Group by status for Kanban view
    const tasksByStatus = {
      todo: tasks.filter(task => task.status === 'todo'),
      'in-progress': tasks.filter(task => task.status === 'in-progress'),
      review: tasks.filter(task => task.status === 'review'),
      completed: tasks.filter(task => task.status === 'completed')
    };

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      tasks,
      grouped: tasksByStatus,
      stats: {
        todo: tasksByStatus.todo.length,
        'in-progress': tasksByStatus['in-progress'].length,
        review: tasksByStatus.review.length,
        completed: tasksByStatus.completed.length,
        total: tasks.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get project activity
// @route   GET /api/v1/projects/:id/activity
// @access  Private (team members)
exports.getProjectActivity = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access (same as tasks)
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view project activity'
      });
    }

    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get feed items related to project
    const query = {
      project: project._id,
      isActive: true
    };

    const total = await FeedItem.countDocuments(query);

    const activity = await FeedItem.find(query)
      .populate('user', 'username avatar')
      .populate('comments.user', 'username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: activity.length,
      total,
      activity
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update project progress
// @route   PUT /api/v1/projects/:id/progress
// @access  Private (team members)
exports.updateProjectProgress = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access
    const isTeamMember = project.team.some(member => 
      member.user.toString() === req.user.id && ['owner', 'admin'].includes(member.role)
    );
    const isOwner = project.owner.toString() === req.user.id;

    if (!isTeamMember && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update project progress'
      });
    }

    const { progress } = req.body;

    if (progress < 0 || progress > 100) {
      return res.status(400).json({
        success: false,
        message: 'Progress must be between 0 and 100'
      });
    }

    project.progress = progress;
    await project.save();

    res.status(200).json({
      success: true,
      message: 'Project progress updated',
      progress: project.progress
    });
  } catch (error) {
    next(error);
  }
};