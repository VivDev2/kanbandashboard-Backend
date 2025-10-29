// server/src/routes/leaves.ts
import express, { Request, Response } from 'express';
import Leave from '../models/Leave';
import User from '../models/User';
import { AuthRequest } from '../types';
import { protect} from '../middleware/auth';
import {authorize}from '../middleware/authorize';

const router = express.Router();

// User: Request leave (any authenticated user)
router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, reason } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to 00:00:00.000

    
    if (start >= end) {
      return res.status(400).json({ 
        success: false, 
        message: 'End date must be after start date' 
      });
    }

    if (start < today) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date cannot be in the past' 
      });
    }

    const leave = new Leave({
      user: user._id,
      startDate: start,
      endDate: end,
      reason,
      status: 'pending'
    });

    await leave.save();

    // Populate the leave before sending
    await leave.populate('user', 'name email');
    
    return res.status(201).json({ success: true, data: leave });
  } catch (error) {
    console.error('Create leave error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// User: Get own leave requests
router.get('/my-requests', protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const leaves = await Leave.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('approvedBy', 'name email');

    return res.json({ success: true, data: leaves });
  } catch (error) {
    console.error('Get user leaves error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Get all leave requests
router.get('/', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const leaves = await Leave.find({})
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('approvedBy', 'name email');

    return res.json({ success: true, data: leaves });
  } catch (error) {
    console.error('Get all leaves error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Get leave requests by status
router.get('/status/:status', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be pending, approved, or rejected' 
      });
    }

    const leaves = await Leave.find({ status })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('approvedBy', 'name email');

    return res.json({ success: true, data: leaves });
  } catch (error) {
    console.error('Get leaves by status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Get leave requests for a specific user
router.get('/user/:userId', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const leaves = await Leave.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('approvedBy', 'name email');

    return res.json({ success: true, data: leaves });
  } catch (error) {
    console.error('Get user leaves error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Approve or reject leave
router.put('/:id', protect, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const admin = req.user;

    if (!admin) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status must be approved or rejected' 
      });
    }

    const leave = await Leave.findByIdAndUpdate(
      id,
      { 
        status,
        approvedBy: admin._id 
      },
      { new: true }
    )
      .populate('user', 'name email')
      .populate('approvedBy', 'name email');

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    return res.json({ success: true, data: leave });
  } catch (error) {
    console.error('Update leave status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Get leave statistics by user
router.get('/stats/:userId', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get all approved leaves for the user
    const leaves = await Leave.find({ 
      user: userId, 
      status: 'approved' 
    });

    // Calculate statistics by month
    const monthlyStats: Record<string, number> = {};
    const yearlyStats: Record<string, number> = {};

    leaves.forEach(leave => {
      const startMonth = new Date(leave.startDate).toLocaleString('default', { month: 'long', year: 'numeric' });
      const startYear = new Date(leave.startDate).getFullYear().toString();
      
      // Calculate number of days for this leave
      const diffTime = Math.abs(new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

      // Monthly stats
      monthlyStats[startMonth] = (monthlyStats[startMonth] || 0) + diffDays;
      
      // Yearly stats
      yearlyStats[startYear] = (yearlyStats[startYear] || 0) + diffDays;
    });

    return res.json({ 
      success: true, 
      data: {
        monthly: monthlyStats,
        yearly: yearlyStats,
        total: leaves.reduce((sum, leave) => {
          const diffTime = Math.abs(new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime());
          return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }, 0)
      } 
    });
  } catch (error) {
    console.error('Get leave stats error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Get overall leave statistics
router.get('/stats', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const allLeaves = await Leave.find({ status: 'approved' })
      .populate('user', 'name email');

    // Group by user
    const userStats: Record<string, any> = {};
    
    allLeaves.forEach(leave => {
      const userId = leave.user._id.toString();
      if (!userStats[userId]) {
        userStats[userId] = {
          user: leave.user,
          totalLeaves: 0,
          monthlyBreakdown: {}
        };
      }

      // Calculate days for this leave
      const diffTime = Math.abs(new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      userStats[userId].totalLeaves += diffDays;
      
      // Monthly breakdown
      const month = new Date(leave.startDate).toLocaleString('default', { month: 'long', year: 'numeric' });
      userStats[userId].monthlyBreakdown[month] = (userStats[userId].monthlyBreakdown[month] || 0) + diffDays;
    });

    return res.json({ 
      success: true, 
      data: {
        userStats,
        totalApprovedLeaves: allLeaves.length,
        totalLeaveDays: allLeaves.reduce((sum, leave) => {
          const diffTime = Math.abs(new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime());
          return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }, 0)
      } 
    });
  } catch (error) {
    console.error('Get overall stats error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;