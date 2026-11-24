/**
 * 应用层限流（零依赖令牌桶）。
 *
 * 为什么需要它 —— 即使已经在前置 Nginx 做了 limit_req：
 *   1. Nginx 只覆盖经过它的流量；直接起 `npm start` 的部署（以及容器内 app 端口）
 *      没有任何限流，应用层兜底才保证「不限部署方式都防刷」
 *   2. 反代配置可能被误改或绕过；应用自己的护栏不依赖外部组件
 *
 * 设计要点：
 *   - 按客户端 IP 计数，固定窗口（实现简单、行为可预期）
 *   - 只作用于 /api/，静态资源不限制
 *   - **健康检查豁免**：探针被限流会导致容器误判 unhealthy，引发重启循环
 *   - 响应带 X-RateLimit-* 与 Retry-After，调用方可据此退避
 *   - 过期桶惰性清理，避免无限增长
 *   - now 可注入 → 单测无需 sleep
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 120;

/** 探针路径必须豁免：被限流会让编排层误判服务不可用 */
const EXEMPT_PREFIXES = ['/api/health'];

/**
 * @param {object} opts
 * @param {number} [opts.windowMs=60000] 窗口长度
 * @param {number} [opts.max=120] 窗口内允许的请求数；<=0 表示关闭
 * @param {() => number} [opts.now] 时间源（测试注入）
 * @param {boolean} [opts.enabled=true]
 */
export function rateLimit({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  now = () => Date.now(),
  enabled = true,
} = {}) {
  const active = enabled && Number.isFinite(max) && max > 0;
  /** @type {Map<string, {count:number, resetAt:number}>} */
  const buckets = new Map();
  let lastSweep = now();

  /** 清掉已过期的桶，防止 Map 无限增长 */
  function sweep(t) {
    if (t - lastSweep < windowMs) return;
    lastSweep = t;
    for (const [key, bucket] of buckets) {
      if (t >= bucket.resetAt) buckets.delete(key);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    if (!active) return next();
    if (!req.path.startsWith('/api/')) return next();
    if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const t = now();
    sweep(t);

    // req.ip 依赖 trust proxy 设置；放在反代后能拿到真实客户端 IP
    const key = req.ip || req.socket?.remoteAddress || 'unknown';

    let bucket = buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - t) / 1000));

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: '请求过于频繁，请稍后再试',
          requestId: req.id ?? null,
        },
      });
    }

    next();
  };
}

export const RATE_LIMIT_DEFAULTS = { windowMs: DEFAULT_WINDOW_MS, max: DEFAULT_MAX };
