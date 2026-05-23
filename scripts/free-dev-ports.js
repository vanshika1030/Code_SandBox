const { execFileSync } = require('child_process');

const PORTS = new Set(['5000', '5173']);

function getListeningPids() {
  const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    const localAddress = parts[1] || '';
    const pid = parts[parts.length - 1];
    const port = localAddress.split(':').pop();

    if (PORTS.has(port) && /^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

const pids = getListeningPids();

if (pids.length === 0) {
  console.log('Ports 5000 and 5173 are already free.');
  process.exit(0);
}

for (const pid of pids) {
  try {
    execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'inherit' });
  } catch {
    console.warn(`Could not stop PID ${pid}. It may have already exited.`);
  }
}

console.log(`Freed dev ports by stopping PID(s): ${pids.join(', ')}`);
