/**
 * Express 应用装配。
 *
 * 与 index.js 分离的原因：测试可以直接 createApp({ db }) 拿到 app，
 * 不需要真的 listen 端口，也不需要进程级副作用。
 */
import express from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { activitiesRouter } from './routes/activities.js';
import { healthRouter, metaRouter, timelineRouter } from './routes/meta.js';
import { cors, requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

/**
 * 创建 Express 应用。
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {boolean} [opts.logger=true] 是否打印请求日志
 * @param {string|null} [opts.staticDir] 前端构建产物目录，传入则单端口托管 SPA
 */
export function createApp({ db, logger = true, staticDir = null } = {}) {
  if (!db) throw new Error('createApp: 必须传入 db');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger({ enabled: logger }));
  app.use(cors({ origin: process.env.CORS_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));

  // ---- API ----
  app.use('/api/health', healthRouter({ db }));
  app.use('/api/meta', metaRouter());
  app.use('/api/timeline', timelineRouter({ db }));
  app.use('/api/activities', activitiesRouter({ db }));

  // ---- 前端静态资源（生产模式，单端口）----
  const distDir = staticDir ?? (process.env.NODE_ENV === 'production'
    ? join(PROJECT_ROOT, 'web/dist')
    : null);

  if (distDir) {
    if (!existsSync(distDir)) {
      console.warn(`[warn] 前端构建产物不存在：${distDir}，请先执行 npm run build`);
    } else {
      app.use(express.static(distDir, { index: 'index.html', maxAge: '1h' }));
      // SPA 兜底：非 /api 的 GET 请求一律返回 index.html，交给前端路由
      app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(join(distDir, 'index.html'));
      });
    }
  }

  // ---- 兜底 ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
