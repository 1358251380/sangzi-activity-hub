/**
 * 请求标识与请求日志。
 *
 * 运维痛点：原来日志只有「时间 / 方法 / 路径 / 状态码 / 耗时」，
 * 并发时无法把「一次失败请求」和「它前后的日志」串起来，也没法让用户报错时提供追踪号。
 *
 * 现在：
 *   - 每个请求有 reqId（优先复用上游反代传入的 X-Request-Id，否则生成）
 *   - reqId 回写到响应头 X-Request-Id，并出现在错误响应体里
 *   - 日志支持 JSON 行格式（生产默认，便于采集）与文本格式（开发默认，便于人读）
 */
import { randomUUID } from 'node:crypto';

/** 允许的上游 request id 形态：短、无空格、无控制字符 */
const REQ_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** 生成 12 位短 id，够用且日志不臃肿 */
function newRequestId() {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * 为每个请求分配 reqId 并回写响应头。
 * 放在最前面，保证后续日志与错误处理都能拿到 req.id。
 */
export function requestId() {
  return (req, res, next) => {
    const inbound = req.get('x-request-id');
    req.id = inbound && REQ_ID_RE.test(inbound) ? inbound : newRequestId();
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}

/**
 * 请求日志。
 * @param {{enabled?:boolean, format?:'json'|'text'}} opts
 */
export function requestLogger({ enabled = true, format = 'json' } = {}) {
  return (req, res, next) => {
    if (!enabled) return next();

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const lvl = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';

      if (format === 'text') {
        console.log(
          `[${new Date().toISOString()}] ${lvl} ${req.id ?? '-'} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`,
        );
        return;
      }

      // JSON 行：字段短名，便于日志系统解析与压缩
      console.log(
        JSON.stringify({
          t: new Date().toISOString(),
          lvl,
          reqId: req.id ?? '-',
          m: req.method,
          p: req.originalUrl,
          s: res.statusCode,
          ms: Number(ms.toFixed(1)),
        }),
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
