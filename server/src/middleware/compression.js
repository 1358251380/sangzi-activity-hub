/**
 * 极简 gzip 压缩（零依赖，约 50 行）。
 *
 * 为什么自己写：项目刻意保持「生产依赖只有 express 一个」，为此不引入 compression 包。
 *
 * 作用范围刻意收窄 —— 只压缩 JSON 接口响应：
 *   1. JSON 由 res.json() 一次性写入，可以安全地在 res.end 处整体替换
 *   2. 静态资源（JS/CSS）体积大且是流式写出，拦截 end 不安全；
 *      那部分交给反向代理（Nginx gzip）处理更合适，也更快（不占用 Node 线程）
 *
 * 保守策略（任一不满足就原样放行）：
 *   - 客户端不支持 gzip / 是 HEAD 请求
 *   - 非 application/json
 *   - 204 / 304（无实体或已协商缓存）
 *   - 已被其他环节编码过
 *   - 体积 < minSize（压缩收益小于开销）或 > maxSize（避免大对象占内存）
 */
import { gzipSync } from 'node:zlib';

const DEFAULT_MIN_SIZE = 1024;
const DEFAULT_MAX_SIZE = 1024 * 1024;

/** 压缩异常只提示一次，避免每请求刷日志 */
let warnedOnce = false;

export function compression({
  enabled = true,
  minSize = DEFAULT_MIN_SIZE,
  maxSize = DEFAULT_MAX_SIZE,
} = {}) {
  return (req, res, next) => {
    if (!enabled) return next();
    if (req.method === 'HEAD') return next();
    if (!/\bgzip\b/i.test(String(req.headers['accept-encoding'] ?? ''))) return next();

    const originalEnd = res.end.bind(res);
    let alreadyHandedOff = false;

    res.end = function compressedEnd(chunk, encoding, callback) {
      // 兼容 res.end(cb) / res.end(chunk, cb) 等重载
      let body = chunk;
      let enc = encoding;
      let cb = callback;
      if (typeof body === 'function') {
        cb = body;
        body = undefined;
        enc = undefined;
      } else if (typeof enc === 'function') {
        cb = enc;
        enc = undefined;
      }

      if (alreadyHandedOff) return originalEnd(body, enc, cb);
      alreadyHandedOff = true;

      try {
        const status = res.statusCode;
        const type = String(res.getHeader('Content-Type') ?? '');
        const isJson = /^application\/json\b/i.test(type);
        const hasEntity = status !== 204 && status !== 304;
        // 已经被其他环节编码过就不能再压一层
        const alreadyEncoded = Boolean(res.getHeader('Content-Encoding'));

        if (!body || !isJson || !hasEntity || alreadyEncoded) {
          return originalEnd(body, enc, cb);
        }

        const buf = Buffer.isBuffer(body)
          ? body
          : Buffer.from(body, typeof enc === 'string' ? enc : 'utf8');

        if (buf.length < minSize || buf.length > maxSize) {
          return originalEnd(buf, undefined, cb);
        }

        const gz = gzipSync(buf);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', String(gz.length));
        res.setHeader('Vary', 'Accept-Encoding');
        return originalEnd(gz, undefined, cb);
      } catch (e) {
        // 压缩只是优化：失败必须退回未压缩，但不能把请求搞坏。
        // 只报一次，避免每请求刷屏。
        if (!warnedOnce) {
          warnedOnce = true;
          console.error('[compression] 压缩失败，已退回未压缩：', e);
        }
        // 压缩链路出任何问题都退回未压缩，绝不因为压缩把请求搞坏
        return originalEnd(chunk, encoding, callback);
      }
    };

    next();
  };
}
