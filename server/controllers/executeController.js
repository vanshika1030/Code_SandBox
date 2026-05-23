import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../middleware/errorHandler.js';

const TIMEOUT_MS = 10_000;

const RUNNERS = {
  javascript: { ext: '.js', cmd: 'node' },
  python: { ext: '.py', cmd: 'python' },
};

export const executeCode = asyncHandler(async (req, res) => {
  const { code, language } = req.body;

  if (!code || !language) {
    res.status(400);
    throw new Error('code and language are required');
  }

  const runner = RUNNERS[language];
  if (!runner) {
    res.status(400);
    throw new Error(`Unsupported language: ${language}. Use javascript or python.`);
  }

  const tmpFile = path.join(os.tmpdir(), `sandbox-${uuidv4()}${runner.ext}`);
  await fs.writeFile(tmpFile, code, 'utf-8');

  try {
    const result = await runProcess(runner.cmd, [tmpFile]);
    res.json({ success: true, data: result });
  } finally {
    // clean up no matter what
    await fs.unlink(tmpFile).catch(() => {});
  }
});

function runProcess(cmd, args) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(cmd, args, { timeout: TIMEOUT_MS });

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
  });
}
