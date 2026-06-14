// server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Load environment variables
dotenv.config();

// ─── Firebase Admin SDK (for Push Notifications) ──────────────
const admin = require('firebase-admin');
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin SDK initialized');
} catch (err) {
  console.error('⚠️  Firebase Admin SDK NOT initialized — push notifications disabled.');
  console.error('   Place serviceAccountKey.json in the project root. Error:', err.message);
}

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.NODE_ENV === 'test' 
        ? process.env.MONGODB_TEST_URI 
        : process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }
    );
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.error('⚠️  Server will continue running WITHOUT MongoDB.');
    console.error('   Routes that need the database (users, chambers, projects, admin) will fail.');
    console.error('   Push notification routes and other non-DB routes will still work.');
    // Do NOT exit — keep the server alive for Firebase/push routes
  }
};

// Connect to database
connectDB();

// Initialize Socket.IO
// (If you don't have the full socket handlers yet, you can skip or comment the next line)
// initializeSocket(io);

// ======== Admin API Routes ========

const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const User = require('./User');
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.role !== 'admin' && user.isPlatformAdmin !== true) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.adminUser = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const AdminLogSchema = new mongoose.Schema({
  action: String,
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: String,
  chamberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chamber' },
  meta: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});
const AdminLog = mongoose.model('AdminLog', AdminLogSchema);

// GET /api/v1/admin/stats — Platform-wide stats
app.get('/api/v1/admin/stats', adminAuth, async (req, res) => {
  try {
    const User = require('./User');
    const Chamber = require('./Chamber');
    const Project = require('./Project');
    const [totalUsers, activeUsers, bannedUsers, totalChambers, totalProjects, activeProjects] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      Chamber.countDocuments(),
      Project.countDocuments(),
      Project.countDocuments({ status: { $in: ['building', 'testing', 'launched'] } })
    ]);
    res.json({ success: true, stats: { totalUsers, activeUsers, bannedUsers, totalChambers, totalProjects, activeProjects } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/admin/users — All users with pagination
app.get('/api/v1/admin/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query;
    const User = require('./User');
    const query = {};
    if (search) query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
    if (status === 'active') query.isActive = true;
    if (status === 'banned') query.isActive = false;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password -emailVerificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    res.json({ success: true, total, page: pageNum, totalPages: Math.ceil(total / limitNum), users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/admin/users/:id/ban — Ban/Unban user
app.put('/api/v1/admin/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const User = require('./User');
    const Chamber = require('./Chamber');
    const { shouldBan, reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Reason required' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !shouldBan;
    if (shouldBan) {
      user.isBanned = true;
      user.bannedAt = new Date();
      user.bannedBy = req.adminUser._id;
      user.banReason = reason;
      await Chamber.updateMany(
        { 'members.user': user._id },
        { $pull: { members: { user: user._id } } }
      );
    } else {
      user.isBanned = false;
      user.bannedAt = null;
      user.banReason = null;
    }
    await user.save();
    await AdminLog.create({
      action: shouldBan ? 'ban_user' : 'unban_user',
      actorId: req.adminUser._id,
      targetUserId: user._id,
      reason,
    });
    res.json({ success: true, message: shouldBan ? 'User banned' : 'User unbanned', user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/admin/users/:id — Delete user
app.delete('/api/v1/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const User = require('./User');
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = false;
    await user.save();
    await AdminLog.create({
      action: 'delete_user',
      actorId: req.adminUser._id,
      targetUserId: user._id,
      reason: req.body.reason || 'Deleted by admin',
    });
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/admin/announcements — Create announcement
app.post('/api/v1/admin/announcements', adminAuth, async (req, res) => {
  try {
    const { title, message, audience, priority } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'Title and message required' });
    const announcement = await AdminLog.create({
      action: 'announcement',
      actorId: req.adminUser._id,
      reason: title,
      meta: { title, message, audience: audience || 'all', priority: priority || 'normal' },
    });
    res.json({ success: true, announcement });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/admin/audit — Audit log
app.get('/api/v1/admin/audit', adminAuth, async (req, res) => {
  try {
    const { action, limit = 100 } = req.query;
    const query = {};
    if (action && action !== 'all') query.action = action;
    const logs = await AdminLog.find(query)
      .populate('actorId', 'username email')
      .populate('targetUserId', 'username email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/admin/chambers — All chambers
app.get('/api/v1/admin/chambers', adminAuth, async (req, res) => {
  try {
    const Chamber = require('./Chamber');
    const chambers = await Chamber.find().sort({ createdAt: -1 });
    res.json({ success: true, chambers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/admin/chambers/:id — Update chamber
app.put('/api/v1/admin/chambers/:id', adminAuth, async (req, res) => {
  try {
    const Chamber = require('./Chamber');
    const chamber = await Chamber.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!chamber) return res.status(404).json({ success: false, message: 'Chamber not found' });
    await AdminLog.create({
      action: 'update_chamber',
      actorId: req.adminUser._id,
      chamberId: chamber._id,
      reason: `Chamber updated: ${Object.keys(req.body).join(', ')}`,
    });
    res.json({ success: true, chamber });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======== Members API (MongoDB Atlas collection) ========

const membersSchema = new mongoose.Schema({
  name: String,
  role: String,
  joined: { type: Date, default: Date.now }
});

const Member = mongoose.model('Member', membersSchema);

// GET all members
app.get('/api/v1/members', async (req, res) => {
  try {
    const members = await Member.find();
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new member
app.post('/api/v1/members', async (req, res) => {
  try {
    const newMember = new Member(req.body);
    const savedMember = await newMember.save();
    res.json(savedMember);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======== Optional: placeholder for missing routes ========
// You can uncomment or add real route files later
/*
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/users', require('./routes/users.routes'));
app.use('/api/v1/projects', require('./routes/projects.routes'));
app.use('/api/v1/chambers', require('./routes/chambers.routes'));
app.use('/api/v1/feed', require('./routes/feed.routes'));
app.use('/api/v1/messages', require('./routes/messages.routes'));
app.use('/api/v1/tasks', require('./routes/tasks.routes'));
app.use('/api/v1/uploads', require('./routes/uploads.routes'));
*/

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Vertex Chamber API is running 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Vertex Chamber API',
    endpoints: {
      members: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/v1/members`
    }
  });
});

// ======== Push Notifications (Firebase Cloud Messaging) ========

// POST /api/v1/push/send-message-notification
// Body: { fcmToken, senderName, username, content, type, conversationId, url }
app.post('/api/v1/push/send-message-notification', async (req, res) => {
  try {
    if (!admin.apps.length) {
      return res.status(503).json({ success: false, message: 'Push notifications not configured on server' });
    }

    const { fcmToken, senderName, username, content, type = 'text', conversationId, url } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'fcmToken is required' });
    }

    const previewText = type === 'text'
      ? String(content || '').slice(0, 120)
      : `Sent a ${type}`;

    const message = {
      token: fcmToken,
      data: {
        type: 'message',
        senderName: senderName || 'a member',
        username: username || '',
        url: url || 'messages.html',
        conversationId: conversationId || '',
      },
      notification: {
        title: 'Vertex Chamber',
        body: `${senderName || 'Someone'}: ${previewText}`,
      },
      webpush: {
        fcmOptions: {
          link: url || 'messages.html',
        },
      },
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (err) {
    console.error('[Push] send-message-notification error:', err);

    // Token no longer valid — caller should remove it from the user's profile
    if (err.code === 'messaging/registration-token-not-registered') {
      return res.status(410).json({ success: false, message: 'Token invalid/expired', code: err.code });
    }

    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/push/send-call-notification
// Body: { fcmToken, callerName, kind ('audio'|'video'), callId, url }
app.post('/api/v1/push/send-call-notification', async (req, res) => {
  try {
    if (!admin.apps.length) {
      return res.status(503).json({ success: false, message: 'Push notifications not configured on server' });
    }

    const { fcmToken, callerName, kind = 'audio', callId, url } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'fcmToken is required' });
    }

    const message = {
      token: fcmToken,
      data: {
        type: 'call',
        kind,
        callerName: callerName || 'Member',
        callId: callId || '',
        url: url || 'messages.html',
      },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (err) {
    console.error('[Push] send-call-notification error:', err);

    if (err.code === 'messaging/registration-token-not-registered') {
      return res.status(410).json({ success: false, message: 'Token invalid/expired', code: err.code });
    }

    res.status(500).json({ success: false, message: err.message });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
// (comment out if you don't have the middleware yet)
// app.use(errorMiddleware);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Vertex Chamber backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Server URL: ${process.env.SERVER_URL || `http://localhost:${PORT}`}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`📡 Socket.IO initialized`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  console.error(err.stack);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

module.exports = { app, server, io };
