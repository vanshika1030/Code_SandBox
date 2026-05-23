import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import Project from '../models/Project.js';
import File from '../models/File.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// each project gets its own sandbox dir for npm packages
function sandboxDir(projectId) {
  return path.join(os.tmpdir(), 'sandbox-packages', projectId.toString());
}

async function ensureSandbox(projectId) {
  const dir = sandboxDir(projectId);
  await fs.mkdir(dir, { recursive: true });

  // init a package.json if missing
  const pkgPath = path.join(dir, 'package.json');
  try {
    await fs.access(pkgPath);
  } catch {
    await fs.writeFile(
      pkgPath,
      JSON.stringify({ name: `sandbox-${projectId}`, version: '1.0.0', private: true }),
      'utf-8'
    );
  }

  return dir;
}

async function upsertProjectFile(projectId, filePath, content) {
  const name = path.basename(filePath);
  const normalizedPath = `/${filePath.split(path.sep).join('/')}`;
  let file = await File.findOne({ projectId, path: normalizedPath });

  if (!file) {
    file = new File({ projectId, name, path: normalizedPath, type: 'file', content });
  } else {
    file.name = name;
    file.type = 'file';
    file.content = content;
  }

  await file.save();
}

async function upsertProjectFolder(projectId, folderPath) {
  const name = path.basename(folderPath);
  const normalizedPath = `/${folderPath.split(path.sep).join('/')}`;
  let folder = await File.findOne({ projectId, path: normalizedPath });

  if (!folder) {
    folder = new File({ projectId, name, path: normalizedPath, type: 'folder' });
  } else {
    folder.name = name;
    folder.type = 'folder';
  }

  await folder.save();
}

async function syncPackageArtifacts(projectId, dir) {
  for (const fileName of ['package.json', 'package-lock.json']) {
    try {
      const content = await fs.readFile(path.join(dir, fileName), 'utf-8');
      await upsertProjectFile(projectId, fileName, content);
    } catch {
      // artifact does not exist yet
    }
  }

  try {
    const stat = await fs.stat(path.join(dir, 'node_modules'));
    if (stat.isDirectory()) await upsertProjectFolder(projectId, 'node_modules');
  } catch {
    // no dependencies installed yet
  }
}

// POST /api/packages/install
export const installPackage = asyncHandler(async (req, res) => {
  const { projectId, packageName } = req.body;

  if (!projectId || !packageName) {
    res.status(400);
    throw new Error('projectId and packageName are required');
  }

  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  const dir = await ensureSandbox(projectId);

  const result = await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn('npm', ['install', packageName], {
      cwd: dir,
      shell: true,
      timeout: 60_000,
    });

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
    proc.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
  });

  if (result.exitCode !== 0) {
    res.status(500);
    throw new Error(`npm install failed: ${result.stderr}`);
  }

  await syncPackageArtifacts(projectId, dir);

  res.json({ success: true, data: { message: `${packageName} installed`, output: result.stdout } });
});

// GET /api/packages/:projectId
export const getPackages = asyncHandler(async (req, res) => {
  const dir = sandboxDir(req.params.projectId);

  let dependencies = {};
  try {
    const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    dependencies = pkg.dependencies || {};
  } catch {
    // no sandbox yet — return empty
  }

  res.json({ success: true, data: dependencies });
});
