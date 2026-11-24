/**
 * 服务入口：加载配置 → 校验（fail-fast）→ 开库 → 装配 → 监听 → 优雅退出。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { closeDatabase, openDatabase } from './db.js';
import { createApp } from './app.js';
import { formatConfigErrors, loadConfig, PROJECT_ROOT } from './config.js';

// .env 可选；不存在时全部走默认值，保证"零配置可跑"
try {
  process.loadEnvFile();
} catch {
  /* 无 .env 文件：使用默认配置 */
}

// ---- 配置校验：非法即退出，不带着错配置对外服务 ----
const config = loadConfig();
if (!config.ok) {
  console.error(formatConfigErrors(config.errors));
  process.exit(1);
}
const cfg = config.value;

const db = openDatabase(cfg.DB_PATH);

const staticDir = cfg.IS_PRODUCTION ? join(PROJECT_ROOT, 'web/dist') : null;

const app = createApp({
  db,
  logFormat: cfg.LOG_FORMAT,
  staticDir,
  trustProxy: cfg.TRUST_PROXY,
  corsOrigin: cfg.CORS_ORIGIN,
  rateLimitOptions: { max: cfg.RATE_LIMIT_MAX, windowMs: cfg.RATE_LIMIT_WINDOW_MS },
  metricsEnabled: cfg.METRICS_ENABLED,
});

const server = app.listen(cfg.PORT, cfg.HOST, () => {
  const loggerFormat = cfg.LOG_FORMAT;
  const emit = (msg) => {
    // 生产默认 JSON 日志，启动信息也用同样的结构，方便统一采集
    if (loggerFormat === 'json') {
      console.log(JSON.stringify({ t: new Date().toISOString(), lvl: 'INFO', msg }));
    } else {
      console.log(msg);
    }
  };

  if (loggerFormat !== 'json') {
    console.log('────────────────────────────────────────────');
    console.log('  校园活动聚合与时间轴系统 · 服务已启动');
    console.log(`  环境      : ${cfg.NODE_ENV}`);
    console.log(`  监听      : http://localhost:${cfg.PORT}`);
    console.log(`  数据库    : ${cfg.DB_PATH}`);
    console.log(`  日志格式  : ${loggerFormat}`);
    console.log(`  健康检查  : http://localhost:${cfg.PORT}/api/health`);
    if (cfg.IS_PRODUCTION) {
      console.log(
        `  前端产物  : ${staticDir} ${existsSync(staticDir) ? '（已找到）' : '（缺失，请先 npm run build）'}`,
      );
    }
    console.log('────────────────────────────────────────────');
  } else {
    emit(`服务已启动 env=${cfg.NODE_ENV} port=${cfg.PORT} db=${cfg.DB_PATH} logFormat=${loggerFormat}`);
    if (cfg.IS_PRODUCTION && !existsSync(staticDir)) {
      emit('前端构建产物缺失，请先执行 npm run build');
    }
  }
});

let closing = false;

/** 优雅退出：先停止接收新连接，再关库；10 秒未完成则强制结束 */
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[${signal}] 正在优雅退出…`);

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
