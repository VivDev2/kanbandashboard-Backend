// server/src/server.ts
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from './models/User';

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory user storage (replace with MongoDB in production)
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}



// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_this_in_production';

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email in MongoDB
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check password using the method we added to the schema
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token (rest of the logic stays the same)
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '5d' }
    );
    
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Add a registration route
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Create new user
    const user = new User({
      name,
      email,
      password,
      role
    });
    
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update the /api/auth/me route to fetch from MongoDB
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    // Fetch user from MongoDB
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});
// Protected route example


// Socket.IO Authentication
// UPDATED SOCKET.IO AUTHENTICATION
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id); // ← Now using MongoDB
    
    if (!user) {
      return next(new Error('User not found'));
    }
    
    (socket as any).user = {
      id: user.id,
      name: user.name,
      role: user.role
    };
    
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  const user = (socket as any).user;
  console.log(`User ${user.name} (${user.role}) connected`);
  
  // Join room based on role
  socket.join(user.role);
  
  // Admin events
  socket.on('admin:broadcast', (data) => {
    if (user.role === 'admin') {
      socket.to('user').emit('user:notification', data);
    }
  });
  
  // User events
  socket.on('user:request', (data) => {
    if (user.role === 'user') {
      socket.to('admin').emit('admin:request', {
        ...data,
        userId: user.id,
        userName: user.name
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`User ${user.name} disconnected`);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  return res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  return res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use('/', (req, res) => {
  return res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rbac')
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Socket.IO server initialized`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

export { app, server, io };