/**
 * 一键开发模式：同时启动后端（node --watch）与前端（Vite dev server）。
 *
 * 为什么用脚本而不是 concurrently 这类依赖：
 *   少一个依赖就少一个装不上/版本冲突的可能，且行为透明（答辩时能讲清楚）。
 *
 * 用法：npm run dev
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

const children = [];
let shuttingDown = false;

function start(name, args, cwd, color) {
  const child = spawn(NODE, args, { cwd, stdio: 'inherit', env: process.env });
  children.push({ name, child });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`\n[${name}] 已退出（code=${code}, signal=${signal}），正在停止其它进程…`);
    shutdown(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`[${name}] 启动失败：`, err.message);
    shutdown(1);
  });

  console.log(`[${name}] 已启动 (pid=${child.pid})`);
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

process.on('SIGINT', () => {
  console.log('\n收到 Ctrl+C，正在停止…');
  shutdown(0);
  setTimeout(() => process.exit(0), 500);
});
process.on('SIGTERM', () => shutdown(0));

console.log('────────────────────────────────────────────');
console.log('  开发模式启动中…');
console.log('  后端 API : http://localhost:3001');
console.log('  前端页面 : http://localhost:5173');
console.log('────────────────────────────────────────────\n');

start('server', ['--watch', 'src/index.js'], join(ROOT, 'server'));
start('web', [join(ROOT, 'web', 'node_modules', 'vite', 'bin', 'vite.js')], join(ROOT, 'web'));
