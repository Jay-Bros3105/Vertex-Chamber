const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config();

// Import models
const User = require('../models/User');
const Project = require('../models/Project');
const Chamber = require('../models/Chamber');
const Skill = require('../models/Skill');
const Task = require('../models/Task');

// Sample data
const sampleUsers = [
  {
    username: 'alexinnovator',
    email: 'alex@example.com',
    password: 'Password123!',
    firstName: 'Alex',
    lastName: 'Turner',
    title: 'Full-Stack Developer & AI Enthusiast',
    bio: 'Passionate about building innovative solutions that solve real-world problems. Experienced in React, Node.js, and machine learning.',
    location: 'San Francisco, CA',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
    skills: [
      { name: 'JavaScript', level: 'expert' },
      { name: 'React', level: 'expert' },
      { name: 'Node.js', level: 'advanced' },
      { name: 'Python', level: 'intermediate' },
      { name: 'TensorFlow', level: 'intermediate' }
    ]
  },
  {
    username: 'sarahbuilder',
    email: 'sarah@example.com',
    password: 'Password123!',
    firstName: 'Sarah',
    lastName: 'Johnson',
    title: 'UI/UX Designer & Frontend Developer',
    bio: 'Creating beautiful and functional user interfaces. Specialized in design systems and user experience optimization.',
    location: 'New York, NY',
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
    skills: [
      { name: 'Figma', level: 'expert' },
      { name: 'React', level: 'advanced' },
      { name: 'TypeScript', level: 'advanced' },
      { name: 'UI/UX Design', level: 'expert' },
      { name: 'CSS/SCSS', level: 'expert' }
    ]
  },
  {
    username: 'marcusdev',
    email: 'marcus@example.com',
    password: 'Password123!',
    firstName: 'Marcus',
    lastName: 'Chen',
    title: 'Backend Engineer & DevOps Specialist',
    bio: 'Building scalable backend systems and optimizing deployment pipelines. Focus on performance and reliability.',
    location: 'Austin, TX',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
    skills: [
      { name: 'Node.js', level: 'expert' },
      { name: 'Python', level: 'advanced' },
      { name: 'Docker', level: 'expert' },
      { name: 'AWS', level: 'advanced' },
      { name: 'MongoDB', level: 'expert' }
    ]
  },
  {
    username: 'davidai',
    email: 'david@example.com',
    password: 'Password123!',
    firstName: 'David',
    lastName: 'Kim',
    title: 'AI/ML Researcher',
    bio: 'Researching cutting-edge machine learning algorithms and their practical applications. PhD in Computer Science.',
    location: 'Boston, MA',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
    skills: [
      { name: 'Python', level: 'expert' },
      { name: 'TensorFlow', level: 'expert' },
      { name: 'PyTorch', level: 'expert' },
      { name: 'Machine Learning', level: 'expert' },
      { name: 'Data Science', level: 'advanced' }
    ]
  }
];

const sampleChambers = [
  {
    name: 'AI & Machine Learning',
    slug: 'ai-machine-learning',
    description: 'Building the future of intelligent systems. From neural networks to generative AI, join us in creating cutting-edge AI solutions.',
    shortDescription: 'Advanced Intelligence Hub',
    icon: 'fas fa-robot',
    category: 'ai-ml',
    color: {
      primary: '#00D4FF',
      secondary: '#8A2BE2'
    },
    tags: ['ai', 'machine-learning', 'neural-networks', 'deep-learning', 'nlp', 'computer-vision'],
    rules: [
      {
        title: 'Respect Intellectual Property',
        description: 'Always respect copyrights and intellectual property rights when sharing code and resources.'
      },
      {
        title: 'Share Knowledge',
        description: 'Help others learn and grow by sharing your knowledge and experiences.'
      }
    ]
  },
  {
    name: 'Web & Mobile Development',
    slug: 'web-mobile-development',
    description: 'Building responsive web apps, cross-platform mobile solutions, and progressive web apps. Modern frameworks, best practices, and performance optimization.',
    shortDescription: 'Digital Experience Lab',
    icon: 'fas fa-code',
    category: 'web-mobile',
    color: {
      primary: '#4ECDC4',
      secondary: '#FF6B6B'
    },
    tags: ['web', 'mobile', 'react', 'vue', 'flutter', 'react-native', 'javascript'],
    rules: [
      {
        title: 'Code Quality',
        description: 'Write clean, maintainable code and follow best practices.'
      },
      {
        title: 'Responsive Design',
        description: 'Always consider mobile users and implement responsive design.'
      }
    ]
  },
  {
    name: 'Hardware & IoT',
    slug: 'hardware-iot',
    description: 'From smart devices to embedded systems, connect the physical and digital worlds. Build innovative hardware solutions with software integration.',
    shortDescription: 'Physical-Digital Bridge',
    icon: 'fas fa-microchip',
    category: 'hardware-iot',
    color: {
      primary: '#FFD93D',
      secondary: '#6BCF7F'
    },
    tags: ['iot', 'hardware', 'arduino', 'raspberry-pi', 'embedded', 'robotics'],
    rules: [
      {
        title: 'Safety First',
        description: 'Always prioritize safety when working with hardware and electronics.'
      },
      {
        title: 'Document Your Work',
        description: 'Proper documentation is essential for hardware projects.'
      }
    ]
  },
  {
    name: 'Social Impact Tech',
    slug: 'social-impact-tech',
    description: 'Technology for good. Build solutions that address social, environmental, and humanitarian challenges. Make a positive impact through innovation.',
    shortDescription: 'Technology for Good',
    icon: 'fas fa-globe-americas',
    category: 'social-impact',
    color: {
      primary: '#FF8E53',
      secondary: '#9B5DE5'
    },
    tags: ['social-good', 'sustainability', 'education', 'healthcare', 'accessibility'],
    rules: [
      {
        title: 'Impact Focused',
        description: 'Prioritize projects that create positive social or environmental impact.'
      },
      {
        title: 'Inclusive Design',
        description: 'Design for everyone, considering accessibility and inclusivity.'
      }
    ]
  }
];

const sampleSkills = [
  { name: 'javascript', displayName: 'JavaScript', category: 'programming', icon: 'fab fa-js', color: '#F7DF1E' },
  { name: 'react', displayName: 'React', category: 'framework', icon: 'fab fa-react', color: '#61DAFB' },
  { name: 'nodejs', displayName: 'Node.js', category: 'framework', icon: 'fab fa-node-js', color: '#339933' },
  { name: 'python', displayName: 'Python', category: 'programming', icon: 'fab fa-python', color: '#3776AB' },
  { name: 'tensorflow', displayName: 'TensorFlow', category: 'ai-ml', icon: 'fas fa-brain', color: '#FF6F00' },
  { name: 'mongodb', displayName: 'MongoDB', category: 'database', icon: 'fas fa-database', color: '#47A248' },
  { name: 'docker', displayName: 'Docker', category: 'devops', icon: 'fab fa-docker', color: '#2496ED' },
  { name: 'aws', displayName: 'AWS', category: 'devops', icon: 'fab fa-aws', color: '#FF9900' },
  { name: 'figma', displayName: 'Figma', category: 'design', icon: 'fab fa-figma', color: '#F24E1E' },
  { name: 'typescript', displayName: 'TypeScript', category: 'programming', icon: 'fas fa-code', color: '#3178C6' }
];

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vertex-chamber', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB Connected for seeding...');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({});
    await Chamber.deleteMany({});
    await Skill.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});

    console.log('👥 Creating users...');
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`   Created user: ${user.username}`);
    }

    console.log('🏛️  Creating chambers...');
    const createdChambers = [];
    for (const chamberData of sampleChambers) {
      const chamber = new Chamber(chamberData);
      
      // Add first user as admin
      if (createdUsers[0]) {
        chamber.admins.push(createdUsers[0]._id);
        await chamber.addMember(createdUsers[0]._id, 'admin');
      }
      
      // Add other users as members
      for (let i = 1; i < createdUsers.length; i++) {
        await chamber.addMember(createdUsers[i]._id, 'member');
      }
      
      await chamber.save();
      createdChambers.push(chamber);
      console.log(`   Created chamber: ${chamber.name}`);
    }

    console.log('🛠️  Creating skills...');
    for (const skillData of sampleSkills) {
      const skill = new Skill(skillData);
      await skill.save();
      console.log(`   Created skill: ${skill.displayName}`);
    }

    console.log('🚀 Creating sample project...');
    const sampleProject = new Project({
      name: 'AI Code Assistant',
      description: 'An intelligent code review and suggestion system that uses machine learning to analyze code patterns and provide contextual suggestions, security vulnerability detection, and performance optimization tips.',
      shortDescription: 'AI-powered code review and suggestion system',
      owner: createdUsers[0]._id,
      team: [
        {
          user: createdUsers[0]._id,
          role: 'owner',
          skills: ['JavaScript', 'React', 'Node.js']
        },
        {
          user: createdUsers[1]._id,
          role: 'member',
          skills: ['Figma', 'UI/UX Design', 'React']
        },
        {
          user: createdUsers[2]._id,
          role: 'member',
          skills: ['Node.js', 'Python', 'MongoDB']
        }
      ],
      chambers: [createdChambers[0]._id, createdChambers[1]._id],
      status: 'building',
      visibility: 'public',
      tags: ['ai', 'machine-learning', 'code-review', 'developer-tools', 'javascript'],
      techStack: [
        { name: 'React', version: '18.2.0', category: 'frontend' },
        { name: 'Node.js', version: '18.x', category: 'backend' },
        { name: 'TensorFlow', version: '2.13.0', category: 'library' },
        { name: 'MongoDB', version: '6.0', category: 'database' }
      ],
      repository: 'https://github.com/vertex-chamber/ai-code-assistant',
      progress: 65,
      milestones: [
        {
          title: 'Project Setup',
          description: 'Initialize repository and development environment',
          completed: true,
          completedAt: new Date('2023-09-01')
        },
        {
          title: 'Core Features',
          description: 'Implement basic code analysis and suggestion functionality',
          completed: true,
          completedAt: new Date('2023-10-15')
        },
        {
          title: 'AI Integration',
          description: 'Integrate machine learning models for intelligent suggestions',
          completed: false,
          dueDate: new Date('2023-11-30')
        },
        {
          title: 'Beta Testing',
          description: 'User testing and feedback collection',
          completed: false,
          dueDate: new Date('2023-12-31')
        }
      ]
    });

    await sampleProject.save();
    console.log(`   Created project: ${sampleProject.name}`);

    // Add project to chamber
    await createdChambers[0].addProject(sampleProject._id);
    await createdChambers[1].addProject(sampleProject._id);

    console.log('📝 Creating sample tasks...');
    const sampleTasks = [
      {
        title: 'Implement User Authentication',
        description: 'Set up JWT-based authentication with email verification',
        project: sampleProject._id,
        createdBy: createdUsers[0]._id,
        assignedTo: [{ user: createdUsers[0]._id }],
        status: 'todo',
        priority: 'high',
        labels: ['authentication', 'security'],
        dueDate: new Date('2023-11-15'),
        estimatedHours: 8
      },
      {
        title: 'Design Database Schema',
        description: 'Create MongoDB schema for code snippets and user profiles',
        project: sampleProject._id,
        createdBy: createdUsers[2]._id,
        assignedTo: [{ user: createdUsers[2]._id }],
        status: 'in-progress',
        priority: 'medium',
        labels: ['database', 'backend'],
        dueDate: new Date('2023-11-20'),
        estimatedHours: 6
      },
      {
        title: 'AI Model Integration',
        description: 'Integrate OpenAI API for code analysis and suggestions',
        project: sampleProject._id,
        createdBy: createdUsers[0]._id,
        assignedTo: [{ user: createdUsers[0]._id }, { user: createdUsers[3]._id }],
        status: 'in-progress',
        priority: 'high',
        labels: ['ai', 'machine-learning', 'integration'],
        dueDate: new Date('2023-11-25'),
        estimatedHours: 16
      },
      {
        title: 'Frontend UI Components',
        description: 'Create React components for code editor interface',
        project: sampleProject._id,
        createdBy: createdUsers[1]._id,
        assignedTo: [{ user: createdUsers[1]._id }],
        status: 'review',
        priority: 'medium',
        labels: ['frontend', 'ui', 'react'],
        dueDate: new Date('2023-11-18'),
        estimatedHours: 12
      },
      {
        title: 'Project Setup',
        description: 'Initialize project structure and development environment',
        project: sampleProject._id,
        createdBy: createdUsers[0]._id,
        assignedTo: [{ user: createdUsers[0]._id }],
        status: 'completed',
        priority: 'low',
        labels: ['setup', 'configuration'],
        completedAt: new Date('2023-10-10'),
        estimatedHours: 4,
        actualHours: 3.5
      }
    ];

    for (const taskData of sampleTasks) {
      const task = new Task(taskData);
      await task.save();
      console.log(`   Created task: ${task.title}`);
    }

    console.log('✅ Database seeded successfully!');
    console.log('\n📋 Sample Data Created:');
    console.log(`   👥 Users: ${createdUsers.length}`);
    console.log(`   🏛️  Chambers: ${createdChambers.length}`);
    console.log(`   🛠️  Skills: ${sampleSkills.length}`);
    console.log(`   🚀 Projects: 1`);
    console.log(`   📝 Tasks: ${sampleTasks.length}`);
    console.log('\n🔑 Test Credentials:');
    console.log('   Email: alex@example.com');
    console.log('   Password: Password123!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run seeder
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;