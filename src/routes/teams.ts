
// server/src/routes/teams.ts
import express, { Request, Response } from 'express';
import Team from '../models/Team';
import User from '../models/User';
import { AuthRequest } from '../types';
import { protect} from '../middleware/auth';
import {authorize}from '../middleware/authorize';



const router = express.Router();

// Get all teams with populated members
router.get('/', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const teams = await Team.find({})
      .populate('members', 'name email role isActive')
      .sort({ createdAt: -1 });
    
    return res.json({ success: true, count: teams.length,  teams });
  } catch (error) {
    console.error('Get teams error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single team
router.get('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('members', 'name email role isActive');
    
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    return res.json({ success: true,  team });
  } catch (error) {
    console.error('Get team error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new team
router.post('/', protect, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, project, members } = req.body;
    
    // Validate members exist
    if (members && members.length > 0) {
      const existingUsers = await User.find({ _id: { $in: members } });
      if (existingUsers.length !== members.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some users do not exist' 
        });
      }
    }
    
    const team = new Team({
      name,
      description,
      project,
      members: members || []
    });
    
    await team.save();
    
    const populatedTeam = await Team.findById(team._id)
      .populate('members', 'name email role isActive');
    
    return res.status(201).json({ success: true, data: populatedTeam });
  } catch (error) {
    console.error('Create team error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update team
router.put('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { name, description, project, members } = req.body;
    
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { name, description, project, members },
      { new: true, runValidators: true }
    ).populate('members', 'name email role isActive');
    
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    return res.json({ success: true,  team });
  } catch (error) {
    console.error('Update team error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete team
router.delete('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    return res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add member to team
router.post('/:id/members', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: userId } }, // $addToSet prevents duplicates
      { new: true }
    ).populate('members', 'name email role isActive');
    
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    return res.json({ success: true,  team });
  } catch (error) {
    console.error('Add member error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Remove member from team
router.delete('/:id/members/:userId', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: req.params.userId } },
      { new: true }
    ).populate('members', 'name email role isActive');
    
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    return res.json({ success: true,  team });
  } catch (error) {
    console.error('Remove member error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;