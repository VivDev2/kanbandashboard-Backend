// server/src/routes/projects.ts
import express, { Request, Response } from 'express';
import Project from '../models/Project';
import { protect } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { io } from '../server';
import mongoose from 'mongoose';

const router = express.Router();

// Get all projects
router.get('/', protect, async (req: Request, res: Response) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    return res.json({ projects });
  } catch (error) {
    console.error('Get projects error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get single project
router.get('/:id', protect, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create project (admin only)
router.post('/', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Project name is required' });
    }

    // Check if project with this name already exists
    const existingProject = await Project.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingProject) {
      return res.status(400).json({ message: 'A project with this name already exists' });
    }

    const project = new Project({
      name: name.trim(),
      description: description ? description.trim() : undefined
    });

    await project.save();

    // Notify all admin users about new project
    // You can implement this if you have admin rooms
    // io.to('admin-room').emit('projectCreated', project);

    return res.status(201).json({ project });
  } catch (error) {
    console.error('Create project error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update project (admin only)
router.put('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Validate ID
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ 
        message: 'Project ID is required and must be valid' 
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        message: 'Invalid project ID format' 
      });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if name already exists (if changing)
    if (name && name.trim() !== project.name) {
      const existingProject = await Project.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });
      if (existingProject) {
        return res.status(400).json({ message: 'A project with this name already exists' });
      }
    }

    // Update project fields if provided
    if (name !== undefined) project.name = name.trim();
    if (description !== undefined) project.description = description.trim();

    await project.save();

    // Notify all admin users about project update
    // io.to('admin-room').emit('projectUpdated', project);

    return res.json({ project });
  } catch (error) {
    console.error('Update project error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete project (admin only)
router.delete('/:id', protect, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Remove the project
    await Project.findByIdAndDelete(projectId);

    // Also remove project reference from all tasks
    // This is optional depending on your requirements
    // await Task.updateMany(
    //   { projectId: projectId },
    //   { $unset: { projectId: 1 } }
    // );

    // Notify all admin users about project deletion
    // io.to('admin-room').emit('projectDeleted', { projectId });

    return res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;