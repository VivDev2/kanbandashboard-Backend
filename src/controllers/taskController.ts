// server/src/controllers/taskController.ts
import { Request, Response } from 'express';
import Task, { ITask } from '../models/Task';
import User from '../models/User';
import { io } from '../server';
import { AuthRequest } from '../types';
import mongoose from 'mongoose';

export const taskController = {
  // Get all tasks (admin) or user's tasks (user)
  getTasks: async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      let tasks: ITask[];
      if (user.role === 'admin') {
        // Admin can see all tasks
        tasks = await Task.find()
          .populate('assignedTo', 'name email')
          .populate('assignedBy', 'name email')
          .sort({ createdAt: -1 });
      } else {
        // User can see tasks assigned to them or created by them
        tasks = await Task.find({
          $or: [
            { assignedTo: { $in: [user._id] } },
            { assignedBy: user._id }
          ]
        })
          .populate('assignedTo', 'name email')
          .populate('assignedBy', 'name email')
          .sort({ createdAt: -1 });
      }

      return res.json({ 
        success: true,
        tasks,
        count: tasks.length
      });
    } catch (error) {
      console.error('Get tasks error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get single task
  getTask: async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;

      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid task ID format' 
        });
      }

      const task = await Task.findById(taskId)
        .populate('assignedTo', 'name email')
        .populate('assignedBy', 'name email');

      if (!task) {
        return res.status(404).json({ 
          success: false,
          message: 'Task not found' 
        });
      }

      // Check if user can access this task
      const user = (req as AuthRequest).user;
      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not authenticated' 
        });
      }

      // Admin can access any task
      if (user.role === 'admin') {
        return res.json({ 
          success: true,
          task 
        });
      }

      // User can access task if assigned to them or created by them
      const assignedToIds = task.assignedTo.map(assignedUser => 
        assignedUser._id.toString()
      );
      
      if (
        assignedToIds.includes(user._id.toString()) || 
        task.assignedBy.toString() === user._id.toString()
      ) {
        return res.json({ 
          success: true,
          task 
        });
      }

      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    } catch (error) {
      console.error('Get task error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Create task
  createTask: async (req: AuthRequest, res: Response) => {
    try {
      const { 
        title, 
        description, 
        priority, 
        assignedTo, 
        dueDate, 
        status 
      } = req.body;
      
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not authenticated' 
        });
      }

      // Validation
      if (!title || !description) {
        return res.status(400).json({ 
          success: false,
          message: 'Title and description are required' 
        });
      }

      if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'AssignedTo is required and must be an array of user IDs' 
        });
      }

      // Validate each assigned user exists
      const validUsers = await User.find({ 
        _id: { $in: assignedTo },
        isActive: true 
      });
      
      if (validUsers.length !== assignedTo.length) {
        return res.status(400).json({ 
          success: false,
          message: 'One or more assigned users do not exist or are inactive' 
        });
      }

      // Create task
      const task = new Task({
        title,
        description,
        priority: priority || 'medium',
        status: status || 'todo',
        assignedTo,
        assignedBy: user._id,
        dueDate: dueDate ? new Date(dueDate) : undefined
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

      return res.status(201).json({ 
        success: true,
        task,
        message: 'Task created successfully'
      });
    } catch (error) {
      console.error('Create task error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Update task
  updateTask: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { 
        title, 
        description, 
        status, 
        priority, 
        assignedTo, 
        dueDate 
      } = req.body;
      
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not authenticated' 
        });
      }

      // Validate ID
      if (!id || id === 'undefined' || id === 'null') {
        return res.status(400).json({ 
          success: false,
          message: 'Task ID is required and must be valid' 
        });
      }

      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid task ID format' 
        });
      }

      const task = await Task.findById(id);
      if (!task) {
        return res.status(404).json({ 
          success: false,
          message: 'Task not found' 
        });
      }

      // Check permissions
      const canModify = task.canBeModifiedBy(user._id, user.role);
      if (!canModify) {
        return res.status(403).json({ 
          success: false,
          message: 'Access denied' 
        });
      }

      // Store original assignedTo for socket emission
      const originalAssignedTo = [...task.assignedTo];

      // Update task fields if provided
      if (title !== undefined) task.title = title.trim();
      if (description !== undefined) task.description = description.trim();
      if (status !== undefined) task.status = status;
      if (priority !== undefined) task.priority = priority;
      if (dueDate !== undefined) task.dueDate = new Date(dueDate);
      
      if (assignedTo !== undefined) {
        // Validate assigned users exist and are active
        const validUsers = await User.find({ 
          _id: { $in: assignedTo },
          isActive: true 
        });
        
        if (validUsers.length !== assignedTo.length) {
          return res.status(400).json({ 
            success: false,
            message: 'One or more assigned users do not exist or are inactive' 
          });
        }
        task.assignedTo = assignedTo;
      }

      await task.save();

      // Populate updated task
      await task.populate('assignedTo', 'name email');
      await task.populate('assignedBy', 'name email');

      // Notify all relevant users about the update
      // Notify previous assigned users
      originalAssignedTo.forEach((userId: any) => {
        io.to(userId._id.toString()).emit('taskUpdated', task);
      });

      // Notify new assigned users (if any)
      task.assignedTo.forEach((userId: any) => {
        if (!originalAssignedTo.some(id => 
          id.toString() === userId._id.toString()
        )) {
          io.to(userId._id.toString()).emit('taskAssigned', task);
        }
      });

      // Notify task creator and admin
      io.to(task.assignedBy.toString()).emit('taskUpdated', task);
      if (user.role === 'admin') {
        io.to(user._id.toString()).emit('taskUpdated', task);
      }

      return res.json({ 
        success: true,
        task,
        message: 'Task updated successfully'
      });
    } catch (error) {
      console.error('Update task error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Delete task
  deleteTask: async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not authenticated' 
        });
      }

      const task = await Task.findById(req.params.id);
      if (!task) {
        return res.status(404).json({ 
          success: false,
          message: 'Task not found' 
        });
      }

      // Only admin or task creator can delete
      if (user.role !== 'admin' && task.assignedBy.toString() !== user._id.toString()) {
        return res.status(403).json({ 
          success: false,
          message: 'Access denied' 
        });
      }

      // Remove the task
      await Task.findByIdAndDelete(req.params.id);

      // Notify assigned users about deletion
      task.assignedTo.forEach((userId: any) => {
        io.to(userId._id.toString()).emit('taskDeleted', { 
          taskId: req.params.id,
          message: 'Task has been deleted'
        });
      });

      // Notify task creator and admin
      io.to(task.assignedBy.toString()).emit('taskDeleted', { 
        taskId: req.params.id,
        message: 'Task has been deleted'
      });
      
      if (user.role === 'admin') {
        io.to(user._id.toString()).emit('taskDeleted', { 
          taskId: req.params.id,
          message: 'Task has been deleted'
        });
      }

      return res.json({ 
        success: true,
        message: 'Task deleted successfully' 
      });
    } catch (error) {
      console.error('Delete task error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get user's tasks statistics
  getTaskStats: async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not authenticated' 
        });
      }

      let query: any = {};
      if (user.role !== 'admin') {
        query.$or = [
          { assignedTo: { $in: [user._id] } },
          { assignedBy: user._id }
        ];
      }

      const stats = await Task.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const totalTasks = await Task.countDocuments(query);
      const overdueTasks = await Task.countDocuments({
        ...query,
        status: { $ne: 'done' },
        dueDate: { $lt: new Date() }
      });

      return res.json({ 
        success: true,
        stats: {
          total: totalTasks,
          overdue: overdueTasks,
          byStatus: stats.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
          }, {} as Record<string, number>)
        }
      });
    } catch (error) {
      console.error('Get task stats error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Bulk update tasks
  bulkUpdateTasks: async (req: AuthRequest, res: Response) => {
    try {
      const { taskIds, updateData } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: 'User not authenticated' 
        });
      }

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Task IDs array is required' 
        });
      }

      // Validate task IDs
      const validIds = taskIds.filter(id => 
        mongoose.Types.ObjectId.isValid(id)
      );

      if (validIds.length !== taskIds.length) {
        return res.status(400).json({ 
          success: false,
          message: 'Some task IDs are invalid' 
        });
      }

      // Check permissions for each task
      const tasks = await Task.find({ _id: { $in: validIds } });
      
      for (const task of tasks) {
        const canModify = task.canBeModifiedBy(user._id, user.role);
        if (!canModify) {
          return res.status(403).json({ 
            success: false,
            message: `Access denied for task ${task._id}` 
          });
        }
      }

      // Perform bulk update
      const result = await Task.updateMany(
        { _id: { $in: validIds } },
        { $set: updateData }
      );

      // Notify users about updates
      tasks.forEach(task => {
        task.assignedTo.forEach((userId: any) => {
          io.to(userId._id.toString()).emit('taskUpdated', task);
        });
      });

      return res.json({ 
        success: true,
        message: `${result.modifiedCount} tasks updated successfully`,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      console.error('Bulk update tasks error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};