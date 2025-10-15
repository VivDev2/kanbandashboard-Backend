// server/src/routes/auth.ts
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { protect } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_this_in_production';

// Login route
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Find user by email (password is selected for comparison)
    const user = await User.findOne({ email, isActive: true }).select('+password') as IUser | null;

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Compare password (this will use the hashed password from DB)
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
});

// Registration route
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }
    
    // Create new user - the password will be hashed automatically by the pre-save hook
    const user = new User({
      name,
      email,
      password, // This is the plain password - mongoose will hash it
      role
    });
    
    // Save user - this triggers the pre-save hook
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' } 
    );
    
    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific MongoDB errors
    if (error instanceof Error && error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: 'Validation error',
        errors: error.message
      });
    }
    
    return res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

// Get current logged-in user
router.get('/me', protect, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  return res.json({
    user: {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.isActive,
    },
  });
});

export default router;