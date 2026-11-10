/**
 * 请求日志中间件 —— 运维向：每条请求留下 method / path / 状态码 / 耗时。
 * 测试环境传入 enabled=false 静默，避免污染测试输出。
 */
export function requestLogger({ enabled = true } = {}) {
  return (req, res, next) => {
    if (!enabled) return next();

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const ts = new Date().toISOString();
      const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
      console.log(
        `[${ts}] ${level} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`,
      );
    });
    next();
  };
}

/**
 * 跨域中间件。仅开发期需要（Vite dev server 与 API 不同端口）。
 * 生产同源部署时 CORS_ORIGIN 为空，不返回任何 CORS 头。
 */
export function cors({ origin } = {}) {
  const allowed = String(origin ?? '').trim();
  return (req, res, next) => {
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', allowed);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}
