import File from '../models/File.js';
import Project from '../models/Project.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// GET /api/files/:projectId — full file tree (without content)
export const getFileTree = asyncHandler(async (req, res) => {
  const files = await File.find({ projectId: req.params.projectId })
    .select('-content')
    .sort({ path: 1 })
    .lean(); // use lean() for read-only queries

  res.json({ success: true, data: files });
});

// GET /api/files/:projectId/all/content — all files with content for preview
export const getAllFilesWithContent = asyncHandler(async (req, res) => {
  const files = await File.find({ projectId: req.params.projectId, type: 'file' })
    .sort({ path: 1 })
    .lean(); // faster read-only query

  res.json({ success: true, data: files });
});

// POST /api/files/:projectId — create file or folder
export const createFile = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { name, path, type, content } = req.body;

  // make sure the project exists
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  if (!name || !path || !type) {
    res.status(400);
    throw new Error('name, path, and type are required');
  }

  const file = await File.create({ projectId, name, path, type, content });
  res.status(201).json({ success: true, data: file });
});

// GET /api/files/:projectId/:fileId — single file with content
export const getFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.fileId,
    projectId: req.params.projectId,
  });

  if (!file) {
    res.status(404);
    throw new Error('File not found');
  }

  res.json({ success: true, data: file });
});

// PUT /api/files/:projectId/:fileId — update content or rename
export const updateFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.fileId,
    projectId: req.params.projectId,
  });

  if (!file) {
    res.status(404);
    throw new Error('File not found');
  }

  const { name, path, content } = req.body;
  if (name !== undefined) file.name = name;
  if (path !== undefined) file.path = path;
  if (content !== undefined) file.content = content;

  await file.save(); // triggers pre-save language detection
  res.json({ success: true, data: file });
});

// DELETE /api/files/:projectId/:fileId — if folder, nuke children too
export const deleteFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.fileId,
    projectId: req.params.projectId,
  });

  if (!file) {
    res.status(404);
    throw new Error('File not found');
  }

  if (file.type === 'folder') {
    // delete everything under this folder's path
    await File.deleteMany({
      projectId: file.projectId,
      path: { $regex: `^${file.path}/` },
    });
  }

  await file.deleteOne();
  res.json({ success: true, data: {} });
});
