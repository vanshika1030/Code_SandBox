import { spawn } from 'child_process';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import File from '../models/File.js';
import Project from '../models/Project.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const runningPreviews = new Map();
const BASE_PORT = 6100;

function sandboxDir(projectId) {
  return path.join(os.tmpdir(), 'sandbox-packages', projectId.toString());
}

async function ensureProjectWorkspace(projectId) {
  const dir = sandboxDir(projectId);
  await fs.mkdir(dir, { recursive: true });

  const records = await File.find({ projectId }).lean();
  await Promise.all(records.map(async (file) => {
    const relativePath = file.path.split('/').filter(Boolean).join(path.sep) || file.name;
    const diskPath = path.join(dir, relativePath);

    if (file.type === 'folder') {
      await fs.mkdir(diskPath, { recursive: true });
      return;
    }

    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, file.content || '', 'utf-8');
  }));

  return dir;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function getFreePort() {
  for (let port = BASE_PORT; port < BASE_PORT + 100; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free preview ports available');
}

function spawnNpmDev(dir, port) {
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', `npm run dev -- --host 127.0.0.1 --port ${port}`], {
      cwd: dir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export const startProjectPreview = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const project = await Project.findById(projectId);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  const existing = runningPreviews.get(projectId);
  if (existing && !existing.proc.killed) {
    res.json({ success: true, data: { url: existing.url, port: existing.port, reused: true } });
    return;
  }

  const dir = await ensureProjectWorkspace(projectId);
  const packageJsonPath = path.join(dir, 'package.json');
  let pkg;

  try {
    pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  } catch {
    res.status(400);
    throw new Error('Project preview requires a package.json file');
  }

  if (!pkg.scripts?.dev) {
    res.status(400);
    throw new Error('Project preview requires a package.json dev script');
  }

  const port = await getFreePort();
  const proc = spawnNpmDev(dir, port);
  const url = `http://127.0.0.1:${port}`;
  runningPreviews.set(projectId, { proc, port, url });

  proc.on('exit', () => {
    const current = runningPreviews.get(projectId);
    if (current?.proc === proc) runningPreviews.delete(projectId);
  });

  setTimeout(() => {
    res.json({ success: true, data: { url, port, reused: false } });
  }, 1200);
});

export const stopProjectPreview = asyncHandler(async (req, res) => {
  const existing = runningPreviews.get(req.params.projectId);
  if (existing) {
    existing.proc.kill();
    runningPreviews.delete(req.params.projectId);
  }

  res.json({ success: true, data: {} });
});
