import { spawn } from 'node:child_process';
import electronPath from 'electron';

const child = spawn(electronPath, ['.'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('Electron 启动失败:', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
