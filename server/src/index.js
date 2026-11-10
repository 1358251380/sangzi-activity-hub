/**
 * 服务入口：加载配置 → 开库 → 装配 → 监听 → 优雅退出。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeDatabase, openDatabase, resolveDbPath } from './db.js';
import { createApp } from './app.js';

// .env 可选；不存在时全部走默认值，保证"零配置可跑"
try {
  process.loadEnvFile();
} catch {
  /* 无 .env 文件：使用默认配置 */
}

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const dbFile = resolveDbPath();

const db = openDatabase();
const app = createApp({ db });

const server = app.listen(PORT, HOST, () => {
  console.log('────────────────────────────────────────────');
  console.log('  校园活动聚合与时间轴系统 · 服务已启动');
  console.log(`  环境      : ${NODE_ENV}`);
  console.log(`  监听      : http://localhost:${PORT}`);
  console.log(`  数据库    : ${dbFile}`);
  console.log(`  健康检查  : http://localhost:${PORT}/api/health`);
  if (NODE_ENV === 'production') {
    console.log(`  前端产物  : ${resolve('web/dist')} ${existsSync(resolve('web/dist')) ? '（已找到）' : '（缺失，请先 npm run build）'}`);
  }
  console.log('────────────────────────────────────────────');
});

let closing = false;

/** 优雅退出：先停止接收新连接，再关库；10 秒未完成则强制结束 */
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n[${signal}] 正在优雅退出…`);

  const force = setTimeout(() => {
    console.error('退出超时（10s），强制结束进程');
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close((err) => {
    if (err) console.error('关闭 HTTP 服务出错：', err);
    closeDatabase(db);
    console.log('已安全退出');
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException');
});
