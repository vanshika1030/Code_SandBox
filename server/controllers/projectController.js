import Project from '../models/Project.js';
import File from '../models/File.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// GET /api/projects
export const getProjects = asyncHandler(async (req, res) => {
  const ownerId = req.get('x-sandbox-session') || null;
  const query = ownerId ? { $or: [{ ownerId }, { ownerId: null }] } : {};
  const projects = await Project.find(query).sort({ lastOpenedAt: -1 });
  res.json({ success: true, data: projects });
});

// POST /api/projects
export const createProject = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Project name is required');
  }

  const project = await Project.create({
    name,
    description,
    ownerId: req.get('x-sandbox-session') || null,
  });
  res.status(201).json({ success: true, data: project });
});

// GET /api/projects/:id
export const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  // bump lastOpenedAt
  project.lastOpenedAt = Date.now();
  await project.save();

  res.json({ success: true, data: project });
});

// PUT /api/projects/:id
export const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  res.json({ success: true, data: project });
});

// DELETE /api/projects/:id — also nukes all associated files
export const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  await File.deleteMany({ projectId: project._id });
  await project.deleteOne();

  res.json({ success: true, data: {} });
});
