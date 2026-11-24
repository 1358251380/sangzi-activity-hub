/**
 * Express 应用装配。
 *
 * 与 index.js 分离的原因：测试可以直接 createApp({ db }) 拿到 app，
 * 不需要真的 listen 端口，也不需要进程级副作用。
 *
 * 中间件顺序（有依赖关系，不要随意调整）：
 *   requestId → requestLogger → cors → compression → json → 路由 → 静态 → 404 → 错误处理
 *   requestId 必须在 logger 之前，否则日志里拿不到 req.id。
 */
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activitiesRouter } from './routes/activities.js';
import { healthRouter, metaRouter, timelineRouter } from './routes/meta.js';
import { cors, requestId, requestLogger } from './middleware/logger.js';
import { compression } from './middleware/compression.js';
import { rateLimit } from './middleware/rate-limit.js';
import { createMetrics } from './middleware/metrics.js';
import { pingDatabase } from './lib/repository.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

/** 带内容哈希的构建产物：可以永久缓存 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** 入口 HTML：必须每次回源校验，否则发版后用户会拿到旧页面引用新资源 → 白屏 */
const NO_CACHE = 'no-cache';

/**
 * 创建 Express 应用。
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {boolean} [opts.logger=true] 是否打印请求日志
 * @param {'json'|'text'} [opts.logFormat='json'] 日志格式
 * @param {string|null} [opts.staticDir] 前端构建产物目录，传入则单端口托管 SPA
 * @param {boolean|number|string} [opts.trustProxy=1] Express trust proxy 设置
 * @param {string} [opts.corsOrigin] 允许的跨域来源
 * @param {boolean} [opts.compress=true] 是否对 JSON 响应启用 gzip
 */
export function createApp({
  db,
  logger = true,
  logFormat = 'json',
  staticDir = null,
  trustProxy = 1,
  corsOrigin = process.env.CORS_ORIGIN,
  compress = true,
  rateLimitOptions = {},
  metricsEnabled = false,
} = {}) {
  if (!db) throw new Error('createApp: 必须传入 db');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  // ---- 可观测性基础 ----
  app.use(requestId());

  // 指标采集放在最前面，才能统计到所有请求（包括被限流拒绝的）
  const metrics = metricsEnabled ? createMetrics() : null;
  if (metrics) app.use(metrics.middleware);

  app.use(requestLogger({ enabled: logger, format: logFormat }));

  // ---- 通用中间件 ----
  app.use(cors({ origin: corsOrigin }));
  app.use(compression({ enabled: compress }));
  // 应用层限流兜底：即使不经反代也要防刷（健康检查自动豁免）
  app.use(rateLimit(rateLimitOptions));
  app.use(express.json({ limit: '100kb' }));

  // ---- API ----
  app.use('/api/health', healthRouter({ db }));
  app.use('/api/meta', metaRouter());
  app.use('/api/timeline', timelineRouter({ db }));
  app.use('/api/activities', activitiesRouter({ db }));

  // ---- Prometheus 指标（默认关闭，需 METRICS_ENABLED=true）----
  if (metrics) {
    app.get('/metrics', (_req, res) => {
      res.type('text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics.render({ dbUp: pingDatabase(db) }));
    });
  }

  // ---- 前端静态资源（生产模式，单端口）----
  const distDir = staticDir ?? (process.env.NODE_ENV === 'production'
    ? join(PROJECT_ROOT, 'web/dist')
    : null);

  if (distDir) {
    if (!existsSync(distDir)) {
      console.warn(`[warn] 前端构建产物不存在：${distDir}，请先执行 npm run build`);
    } else {
      const assetsDir = `${sep}assets${sep}`;

      app.use(
        express.static(distDir, {
          // 关掉自动 index，让下面统一的 SPA 兜底返回 index.html 并带上 no-cache
          index: false,
          maxAge: '1h',
          setHeaders(res, filePath) {
            if (filePath.includes(assetsDir)) {
              res.setHeader('Cache-Control', IMMUTABLE);
            } else if (filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', NO_CACHE);
            }
          },
        }),
      );

      // SPA 兜底：非 /api 的 GET/HEAD 一律返回 index.html，交给前端路由
      app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(join(distDir, 'index.html'), {
          headers: { 'Cache-Control': NO_CACHE },
        });
      });
    }
  }

  // ---- 兜底 ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
