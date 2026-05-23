import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import Project from '../models/Project.js';
import File from '../models/File.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const TIMEOUT_MS = 30_000; // 30 second timeout for terminal commands
const MAX_OUTPUT_SIZE = 50_000; // 50KB max output
const MAX_SYNC_FILE_SIZE = 1_000_000; // 1MB per text file
const IGNORED_SYNC_DIRS = new Set(['.git', 'dist', 'build', '.vite']);
const SHALLOW_SYNC_DIRS = new Set(['node_modules']);

// Whitelist of allowed commands for security
const ALLOWED_COMMANDS = {
  cat: 'cat',
  cd: 'cd',
  cwd: 'cwd',
  dir: 'dir',
  echo: 'echo',
  ls: 'ls',
  mkdir: 'mkdir',
  npm: 'npm',
  node: 'node',
  pwd: 'pwd',
  python: 'python',
  py: 'py',
  touch: 'touch',
};

function tokenizeCommand(input) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;

  while ((match = re.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }

  return tokens;
}

function resolveProcess(cmd, args) {
  if (process.platform === 'win32' && cmd === 'npm') {
    return {
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/c', [cmd, ...args].join(' ')],
    };
  }

  return { executable: cmd, args };
}

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

async function listWorkspaceEntries(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = { dirs: [], files: [] };

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_SYNC_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.dirs.push(fullPath);
      if (!SHALLOW_SYNC_DIRS.has(entry.name)) {
        const childEntries = await listWorkspaceEntries(fullPath, baseDir);
        result.dirs.push(...childEntries.dirs);
        result.files.push(...childEntries.files);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = await fs.stat(fullPath);
    if (stat.size > MAX_SYNC_FILE_SIZE) continue;

    result.files.push(fullPath);
  }

  return result;
}

async function syncWorkspaceToProject(projectId, workspaceDir) {
  const { dirs, files } = await listWorkspaceEntries(workspaceDir);

  for (const diskPath of dirs) {
    const relativePath = path.relative(workspaceDir, diskPath).split(path.sep).join('/');
    const filePath = `/${relativePath}`;
    const name = path.basename(relativePath);

    let file = await File.findOne({ projectId, path: filePath });
    if (!file) {
      file = new File({ projectId, name, path: filePath, type: 'folder' });
    } else {
      file.name = name;
      file.type = 'folder';
    }

    await file.save();
  }

  for (const diskPath of files) {
    const relativePath = path.relative(workspaceDir, diskPath).split(path.sep).join('/');
    const content = await fs.readFile(diskPath, 'utf-8');
    const filePath = `/${relativePath}`;
    const name = path.basename(relativePath);

    let file = await File.findOne({ projectId, path: filePath });
    if (!file) {
      file = new File({ projectId, name, path: filePath, type: 'file', content });
    } else {
      file.name = name;
      file.type = 'file';
      file.content = content;
    }

    await file.save();
  }
}

function getProjectCwd(project, workspaceDir) {
  return path.join(workspaceDir, project.terminalCwd || '');
}

function formatProjectPath(relativePath) {
  return relativePath ? `/${relativePath.split(path.sep).join('/')}` : '/';
}

function resolveProjectPath(workspaceDir, currentDiskPath, target = '.') {
  const targetDiskPath = target === '/' || target === '\\'
    ? workspaceDir
    : path.resolve(currentDiskPath, target);
  const relativeTarget = path.relative(workspaceDir, targetDiskPath);

  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    return { error: 'Cannot access paths outside the project workspace' };
  }

  return { diskPath: targetDiskPath, relativePath: relativeTarget };
}

async function listDirectory(diskPath) {
  const entries = await fs.readdir(diskPath, { withFileTypes: true });
  return entries
    .filter(entry => !entry.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    })
    .map(entry => `${entry.isDirectory() ? 'd' : '-'} ${entry.name}`)
    .join('\n');
}

async function runBuiltinCommand(project, workspaceDir, parsed) {
  const currentRelative = project.terminalCwd || '';
  const currentDiskPath = path.join(workspaceDir, currentRelative);

  if (parsed.cmd === 'pwd' || parsed.cmd === 'cwd') {
    return {
      stdout: `${formatProjectPath(currentRelative)}\n`,
      stderr: '',
      exitCode: 0,
      command: parsed.original,
    };
  }

  if (parsed.cmd === 'ls' || parsed.cmd === 'dir') {
    const target = resolveProjectPath(workspaceDir, currentDiskPath, parsed.args[0] || '.');
    if (target.error) return { stdout: '', stderr: target.error, exitCode: 1, command: parsed.original };

    try {
      const stat = await fs.stat(target.diskPath);
      if (!stat.isDirectory()) {
        return { stdout: '', stderr: `${parsed.args[0]}: Not a directory`, exitCode: 1, command: parsed.original };
      }
      return { stdout: `${await listDirectory(target.diskPath)}\n`, stderr: '', exitCode: 0, command: parsed.original };
    } catch {
      return { stdout: '', stderr: `${parsed.args[0] || '.'}: No such directory`, exitCode: 1, command: parsed.original };
    }
  }

  if (parsed.cmd === 'mkdir') {
    if (!parsed.args.length) return { stdout: '', stderr: 'mkdir: missing folder name', exitCode: 1, command: parsed.original };

    for (const arg of parsed.args) {
      const target = resolveProjectPath(workspaceDir, currentDiskPath, arg);
      if (target.error) return { stdout: '', stderr: target.error, exitCode: 1, command: parsed.original };
      await fs.mkdir(target.diskPath, { recursive: true });
    }

    return { stdout: '', stderr: '', exitCode: 0, command: parsed.original };
  }

  if (parsed.cmd === 'touch') {
    if (!parsed.args.length) return { stdout: '', stderr: 'touch: missing file name', exitCode: 1, command: parsed.original };

    for (const arg of parsed.args) {
      const target = resolveProjectPath(workspaceDir, currentDiskPath, arg);
      if (target.error) return { stdout: '', stderr: target.error, exitCode: 1, command: parsed.original };
      await fs.mkdir(path.dirname(target.diskPath), { recursive: true });
      const handle = await fs.open(target.diskPath, 'a');
      await handle.close();
      const now = new Date();
      await fs.utimes(target.diskPath, now, now);
    }

    return { stdout: '', stderr: '', exitCode: 0, command: parsed.original };
  }

  if (parsed.cmd === 'cat') {
    if (!parsed.args.length) return { stdout: '', stderr: 'cat: missing file name', exitCode: 1, command: parsed.original };
    const target = resolveProjectPath(workspaceDir, currentDiskPath, parsed.args[0]);
    if (target.error) return { stdout: '', stderr: target.error, exitCode: 1, command: parsed.original };

    try {
      const stat = await fs.stat(target.diskPath);
      if (!stat.isFile() || stat.size > MAX_SYNC_FILE_SIZE) {
        return { stdout: '', stderr: `${parsed.args[0]}: Cannot read file`, exitCode: 1, command: parsed.original };
      }
      return { stdout: await fs.readFile(target.diskPath, 'utf-8'), stderr: '', exitCode: 0, command: parsed.original };
    } catch {
      return { stdout: '', stderr: `${parsed.args[0]}: No such file`, exitCode: 1, command: parsed.original };
    }
  }

  if (parsed.cmd === 'echo') {
    return { stdout: `${parsed.args.join(' ')}\n`, stderr: '', exitCode: 0, command: parsed.original };
  }

  if (parsed.cmd !== 'cd') return null;

  const targetArg = parsed.args[0] || '';
  const target = resolveProjectPath(workspaceDir, currentDiskPath, targetArg || workspaceDir);

  if (target.error) {
    return {
      stdout: '',
      stderr: target.error,
      exitCode: 1,
      command: parsed.original,
    };
  }

  try {
    const stat = await fs.stat(target.diskPath);
    if (!stat.isDirectory()) {
      return { stdout: '', stderr: `${targetArg}: Not a directory`, exitCode: 1, command: parsed.original };
    }
  } catch {
    return { stdout: '', stderr: `${targetArg || '/'}: No such directory`, exitCode: 1, command: parsed.original };
  }

  project.terminalCwd = target.relativePath;
  await project.save();
  return {
    stdout: `${formatProjectPath(target.relativePath)}\n`,
    stderr: '',
    exitCode: 0,
    command: parsed.original,
  };
}

// Validate and parse command
function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = tokenizeCommand(trimmed);
  const cmd = parts[0].toLowerCase();

  // Check if command is allowed
  if (!ALLOWED_COMMANDS[cmd]) {
    return { error: `Command not allowed. Allowed: cd, pwd, cwd, ls, dir, touch, mkdir, cat, echo, npm, node, python` };
  }

  if (parts.slice(1).some(arg => /[&|<>]/.test(arg))) {
    return { error: 'Shell control characters are not allowed in terminal commands' };
  }

  return {
    cmd: ALLOWED_COMMANDS[cmd],
    args: parts.slice(1),
    original: trimmed,
  };
}

// Execute terminal command
export const executeCommand = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { command } = req.body;

  if (!command || !command.trim()) {
    res.status(400);
    throw new Error('Command is required');
  }

  // Verify project exists
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  const parsed = parseCommand(command);
  if (parsed.error) {
    res.status(400);
    throw new Error(parsed.error);
  }

  try {
    const workspaceDir = await ensureProjectWorkspace(projectId);
    const builtinResult = await runBuiltinCommand(project, workspaceDir, parsed);
    const result = builtinResult || await runCommand(parsed.cmd, parsed.args, getProjectCwd(project, workspaceDir));
    await syncWorkspaceToProject(projectId, workspaceDir);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({
      success: false,
      data: {
        stdout: '',
        stderr: err.message || 'Command execution failed',
        exitCode: 1,
      },
    });
  }
});

// Run command with timeout and output capture
function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const resolved = resolveProcess(cmd, args);
    const commandStr = [cmd, ...args].join(' ');

    const proc = spawn(resolved.executable, resolved.args, {
      shell: false,
      timeout: TIMEOUT_MS,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, TIMEOUT_MS);

    if (!proc.stdout || !proc.stderr) {
      clearTimeout(timeoutHandle);
      resolve({
        stdout: '',
        stderr: 'Failed to execute command',
        exitCode: 1,
        command: commandStr,
      });
      return;
    }

    proc.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      if ((stdout + str).length <= MAX_OUTPUT_SIZE) {
        stdout += str;
      }
    });

    proc.stderr.on('data', (chunk) => {
      const str = chunk.toString();
      if ((stderr + str).length <= MAX_OUTPUT_SIZE) {
        stderr += str;
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutHandle);
      
      if (timedOut) {
        stderr += '\n[Process timed out after 30 seconds]';
      }

      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
        command: commandStr,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      resolve({
        stdout: '',
        stderr: err.message || 'Process error',
        exitCode: 1,
        command: commandStr,
      });
    });
  });
}
