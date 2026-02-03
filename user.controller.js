const User = require('../models/User');
const Project = require('../models/Project');
const Chamber = require('../models/Chamber');
const mongoose = require('mongoose');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, sortBy = 'createdAt', order = 'desc' } = req.query;

    // Build query
    const query = {};

    // Search by username, email, or name
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Only show active users by default
    if (req.query.showInactive !== 'true') {
      query.isActive = true;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await User.countDocuments(query);

    // Get users
    const users = await User.find(query)
      .select('-password -emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limitNum)
      .populate('chambers', 'name slug')
      .populate('projects.project', 'name slug status');

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user by ID
// @route   GET /api/v1/users/:id
// @access  Public (with privacy restrictions)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire')
      .populate('chambers', 'name slug icon memberCount')
      .populate('projects.project', 'name slug status progress bannerImage')
      .populate('skills');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Check privacy settings
    const isViewingOwnProfile = req.user && req.user.id === user.id;
    const isAdmin = req.user && req.user.role === 'admin';
    
    if (!isViewingOwnProfile && !isAdmin) {
      // Apply privacy settings
      if (user.settings.privacy.profileVisibility === 'private') {
        return res.status(403).json({
          success: false,
          message: 'This profile is private'
        });
      }

      // Hide email if not allowed
      if (!user.settings.privacy.showEmail) {
        user.email = undefined;
      }

      // Hide location if not allowed
      if (!user.settings.privacy.showLocation) {
        user.location = undefined;
      }
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by username
// @route   GET /api/v1/users/username/:username
// @access  Public (with privacy restrictions)
exports.getUserByUsername = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire')
      .populate('chambers', 'name slug icon memberCount')
      .populate('projects.project', 'name slug status progress bannerImage')
      .populate('skills');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with username ${req.params.username}`
      });
    }

    // Check privacy settings (same as above)
    const isViewingOwnProfile = req.user && req.user.id === user.id;
    const isAdmin = req.user && req.user.role === 'admin';
    
    if (!isViewingOwnProfile && !isAdmin) {
      if (user.settings.privacy.profileVisibility === 'private') {
        return res.status(403).json({
          success: false,
          message: 'This profile is private'
        });
      }

      if (!user.settings.privacy.showEmail) {
        user.email = undefined;
      }

      if (!user.settings.privacy.showLocation) {
        user.location = undefined;
      }
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private (owner or admin)
exports.updateUser = async (req, res, next) => {
  try {
    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Make sure user is owner or admin
    if (user.id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this user`
      });
    }

    // Update user
    user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).select('-password -emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private (owner or admin)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Make sure user is owner or admin
    if (user.id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to delete this user`
      });
    }

    // Soft delete (deactivate) instead of hard delete
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's projects
// @route   GET /api/v1/users/:id/projects
// @access  Public
exports.getUserProjects = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { 'team.user': req.params.id };
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await Project.countDocuments(query);

    const projects = await Project.find(query)
      .populate('owner', 'username avatar')
      .populate('team.user', 'username avatar')
      .sort({ createdAt: -1 })
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

// @desc    Get user's chambers
// @route   GET /api/v1/users/:id/chambers
// @access  Public
exports.getUserChambers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await Chamber.countDocuments({ 'members.user': req.params.id });

    const chambers = await Chamber.find({ 'members.user': req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: chambers.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      chambers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add skill to user
// @route   POST /api/v1/users/:id/skills
// @access  Private (owner or admin)
exports.addSkill = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Make sure user is owner or admin
    if (user.id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this user's skills`
      });
    }

    const { name, level = 'intermediate' } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide skill name'
      });
    }

    const added = await user.addSkill(name, level);

    if (!added) {
      return res.status(400).json({
        success: false,
        message: 'Skill already exists'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Skill added successfully',
      skills: user.skills
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove skill from user
// @route   DELETE /api/v1/users/:id/skills/:skillName
// @access  Private (owner or admin)
exports.removeSkill = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Make sure user is owner or admin
    if (user.id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this user's skills`
      });
    }

    const removed = await user.removeSkill(req.params.skillName);

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Skill not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Skill removed successfully',
      skills: user.skills
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user settings
// @route   PUT /api/v1/users/:id/settings
// @access  Private (owner or admin)
exports.updateSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Make sure user is owner or admin
    if (user.id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this user's settings`
      });
    }

    // Update settings
    if (req.body.notifications) {
      user.settings.notifications = {
        ...user.settings.notifications,
        ...req.body.notifications
      };
    }

    if (req.body.privacy) {
      user.settings.privacy = {
        ...user.settings.privacy,
        ...req.body.privacy
      };
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      settings: user.settings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user stats
// @route   GET /api/v1/users/:id/stats
// @access  Public
exports.getUserStats = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`
      });
    }

    // Get project stats
    const projectStats = {
      total: user.projects.length,
      launched: await user.launchedProjectsCount,
      active: user.projects.length - await user.launchedProjectsCount
    };

    // Get chamber stats
    const chamberStats = {
      total: user.chambers.length,
      admin: await Chamber.countDocuments({ admins: user._id }),
      member: user.chambers.length - await Chamber.countDocuments({ admins: user._id })
    };

    // Get contribution stats
    const contributionStats = {
      tasksCompleted: 0, // Would come from Task model
      commentsMade: 0, // Would come from FeedItem model
      likesReceived: 0 // Would come from FeedItem model
    };

    // Get activity stats
    const activityStats = {
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      memberSince: user.createdAt
    };

    res.status(200).json({
      success: true,
      stats: {
        project: projectStats,
        chamber: chamberStats,
        contribution: contributionStats,
        activity: activityStats,
        badges: user.badges.length,
        skills: user.skills.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Search users
// @route   GET /api/v1/users/search
// @access  Public
exports.searchUsers = async (req, res, next) => {
  try {
    const { q, skill, chamber, page = 1, limit = 20 } = req.query;

    const query = { isActive: true };

    // Search by query
    if (q) {
      query.$or = [
        { username: { $regex: q, $options: 'i' } },
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { title: { $regex: q, $options: 'i' } },
        { bio: { $regex: q, $options: 'i' } }
      ];
    }

    // Filter by skill
    if (skill) {
      query['skills.name'] = { $regex: skill, $options: 'i' };
    }

    // Filter by chamber membership
    if (chamber) {
      const chamberDoc = await Chamber.findOne({ slug: chamber });
      if (chamberDoc) {
        query._id = { $in: chamberDoc.members.map(m => m.user) };
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select('username firstName lastName avatar title bio skills chambers')
      .populate('chambers', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      users
    });
  } catch (error) {
    next(error);
  }
};