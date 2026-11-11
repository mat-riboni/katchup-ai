// Start a persistent local server. Its lifetime is independent of this launcher.
import { spawn } from 'node:child_process';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.WEB_PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WEB_PORT must be a valid port number.');
const url = `http://localhost:${port}`;
const probe = `http://127.0.0.1:${port}`;
const runtime = join(project, '.runtime');

async function status() {
  try {
    const response = await fetch(`${probe}/lesson/lesson.json`, { signal: AbortSignal.timeout(1000) });
    const lesson = await response.json();
    return lesson.id === 'robot-learning-lecture-5a' && lesson.slides?.length === 62 ? 'ready' : 'occupied';
  } catch (error) {
    return error.cause?.code === 'ECONNREFUSED' ? 'stopped' : 'occupied';
  }
}

let state = await status();
if (state === 'occupied') throw new Error(`Port ${port} is occupied by another service. Set WEB_PORT to a free port.`);
if (state !== 'ready') {
  await mkdir(runtime, { recursive: true });
  const log = await open(join(runtime, 'server.log'), 'a');
  const child = spawn(process.execPath, [join(project, 'scripts/serve-web.mjs')], {
    cwd: project, detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, WEB_PORT: String(port) },
  });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  await log.close();
  await writeFile(join(runtime, 'server.pid'), `${child.pid}\n`);
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (await status() === 'ready') { state = 'ready'; break; }
  }
  if (state !== 'ready') throw new Error('The local server did not start. See .runtime/server.log.');
}
console.log(`Katchup is running: ${url}`);
console.log('The local server stays running after this launcher exits.');
if (!process.argv.includes('--no-open')) {
  const command = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  const browser = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
  browser.on('error', () => console.log(`Open ${url} in your browser.`));
  browser.unref();
}
