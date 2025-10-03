// server/src/routes/tasks.ts
import express, { Request, Response } from 'express';
import Task from '../models/Task';
import { protect } from '../middleware/auth';
import { authorize} from '../middleware/authorize'
import User from '../models/User';
import { AuthRequest } from '../types';
import { io } from '../server';
import mongoose from 'mongoose';

const router = express.Router();

// Define the users route BEFORE the dynamic route
router.get('/users', protect, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ isActive: true }, 'name email role');
    return res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get all tasks (admin) or user's tasks (user)
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    let tasks;
    if (user.role === 'admin') {
      // Admin can see all tasks
      tasks = await Task.find()
        .populate('assignedTo', 'name email')
        .populate('assignedBy', 'name email')
        .sort({ createdAt: -1 });
    } else {
      // User can see tasks assigned to them
      tasks = await Task.find({ assignedTo: user._id })
        .populate('assignedTo', 'name email')
        .populate('assignedBy', 'name email')
        .sort({ createdAt: -1 });
    }

    return res.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get single task
router.get('/:id', protect, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(taskId)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user can access this task
    const user = (req as AuthRequest).user;
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Admin can access any task
    if (user.role === 'admin') {
      return res.json({ task });
    }

    // User can access task if assigned to them
    const assignedToIds = task.assignedTo.map(assignedUser => assignedUser._id.toString());
    if (assignedToIds.includes(user._id.toString())) {
      return res.json({ task });
    }

    // User can access task if they created it
    if (task.assignedBy.toString() === user._id.toString()) {
      return res.json({ task });
    }

    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    console.error('Get task error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create task (admin only)
router.post('/', protect, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, priority, assignedTo, dueDate, status } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Validate assignedTo is an array of valid ObjectIds
    if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
      return res.status(400).json({ message: 'AssignedTo is required and must be an array of user IDs' });
    }

    // Validate each assigned user exists
    const validUsers = await User.find({ _id: { $in: assignedTo } });
    if (validUsers.length !== assignedTo.length) {
      return res.status(400).json({ message: 'One or more assigned users do not exist' });
    }

    const task = new Task({
      title,
      description,
      priority,
      status: status || 'todo',
      assignedTo,
      assignedBy: user._id,
      dueDate
    });

    await task.save();

    // Populate the task before sending
    await task.populate('assignedTo', 'name email');
    await task.populate('assignedBy', 'name email');

    // Emit task created event to assigned users
    task.assignedTo.forEach((userId: any) => {
      io.to(userId._id.toString()).emit('taskAssigned', task);
    });

    // Emit to admin's room for real-time updates
    io.to(user._id.toString()).emit('taskCreated', task);

    return res.status(201).json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update task
router.put('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assignedTo, dueDate } = req.body;
    const user = req.user;

    // Validate ID
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ 
        message: 'Task ID is required and must be valid' 
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        message: 'Invalid task ID format' 
      });
    }

    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Only admin or task creator can update (except for status changes by assigned users)
    if (user.role !== 'admin' && task.assignedBy.toString() !== user._id.toString()) {
      // Allow assigned users to update status only
      if (req.body.status && Object.keys(req.body).length === 1) {
        const assignedToIds = task.assignedTo.map(userId => userId.toString());
        if (!assignedToIds.includes(user._id.toString())) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Store original assignedTo for socket emission
    const originalAssignedTo = [...task.assignedTo];

    // Update task fields if provided
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = dueDate;
    
    if (assignedTo !== undefined) {
      // Validate assigned users exist
      const validUsers = await User.find({ _id: { $in: assignedTo } });
      if (validUsers.length !== assignedTo.length) {
        return res.status(400).json({ message: 'One or more assigned users do not exist' });
      }
      task.assignedTo = assignedTo;
    }

    await task.save();

    // Populate updated task
    await task.populate('assignedTo', 'name email');
    await task.populate('assignedBy', 'name email');

    // Notify all assigned users about the update
    // Notify previous assigned users
    originalAssignedTo.forEach((userId: any) => {
      io.to(userId._id.toString()).emit('taskUpdated', task);
    });

    // Notify new assigned users
    task.assignedTo.forEach((userId: any) => {
      if (!originalAssignedTo.some(id => id.toString() === userId._id.toString())) {
        io.to(userId._id.toString()).emit('taskAssigned', task);
      }
    });

    // Notify admin
    io.to(user._id.toString()).emit('taskUpdated', task);

    return res.json({ task });
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete task
router.delete('/:id', protect, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Remove the task
    await Task.findByIdAndDelete(req.params.id);

    // Notify assigned users about deletion
    task.assignedTo.forEach((userId: any) => {
      io.to(userId._id.toString()).emit('taskDeleted', { taskId: req.params.id });
    });

    // Notify admin
    io.to(user._id.toString()).emit('taskDeleted', { taskId: req.params.id });

    return res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;