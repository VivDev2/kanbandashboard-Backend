// server/src/routes/users.ts
import express, { Request, Response } from 'express';
import User from '../models/User';
import Team from '../models/Team';
import { AuthRequest } from '../types';
import { protect} from '../middleware/auth';
import {authorize}from '../middleware/authorize';


const router = express.Router();

// Get all users (admin only)
router.get('/', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const users = await User.find({})
      .select('-password') // Don't return password
      .sort({ createdAt: -1 });
    
    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single user (admin only)
router.get('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    return res.json({ success: true,  user });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user role (admin only)
router.put('/:id/role', protect, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    
    // Validate role
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Must be "admin" or "user"' 
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    return res.json({ success: true,  user });
  } catch (error) {
    console.error('Update user role error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user status (admin only)
router.put('/:id/status', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    return res.json({ success: true,  user });
  } catch (error) {
    console.error('Update user status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Remove user from any teams
    await Team.updateMany(
      { members: user._id },
      { $pull: { members: user._id } }
    );
    
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;