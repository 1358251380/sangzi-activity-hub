/**
 * 统一错误类型与错误处理中间件。
 *
 * 响应结构（与 docs/02 一致）：
 *   { "error": { "code": "...", "message": "...", "fields": {...}, "requestId": "..." } }
 *
 * requestId：让用户报「出错」时能提供追踪号，运维可直接在日志里定位那一次请求。
 * 这是可观测性最小闭环：响应头 X-Request-Id ↔ 日志 reqId ↔ 错误体 requestId 三者一致。
 */
export class HttpError extends Error {
  /**
   * @param {number} status HTTP 状态码
   * @param {string} code 机器可读错误码
   * @param {string} message 面向用户的中文说明
   * @param {Record<string,string>} [fields] 逐字段错误
   */
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message) => new HttpError(400, 'BAD_REQUEST', message);
export const notFound = (message = '活动不存在') => new HttpError(404, 'NOT_FOUND', message);
export const validationFailed = (fields, message = '表单校验未通过') =>
  new HttpError(422, 'VALIDATION_FAILED', message, fields);

/** 统一错误响应体，保证所有出口结构一致 */
function errorBody(req, code, message, extra) {
  return {
    error: {
      code,
      message,
      ...(extra ?? {}),
      requestId: req.id ?? null,
    },
  };
}

/** 未匹配到任何路由 */
export function notFoundHandler(req, res) {
  res
    .status(404)
    .json(errorBody(req, 'NOT_FOUND', `接口不存在：${req.method} ${req.originalUrl}`));
}

/**
 * 全局错误处理。必须保持 4 个参数，Express 才认作错误中间件。
 */
export const errorHandler = (err, req, res, _next) => {
  // 请求体 JSON 解析失败
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json(errorBody(req, 'BAD_REQUEST', '请求体不是合法的 JSON'));
  }

  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json(errorBody(req, err.code, err.message, err.fields ? { fields: err.fields } : undefined));
  }

  // 数据库约束兜底：应用层校验已拦截，走到这里说明有遗漏
  const raw = String(err?.message ?? '');
  if (raw.includes('CHECK constraint failed') || raw.includes('constraint failed')) {
    console.error(`[db-constraint] reqId=${req.id ?? '-'} ${raw}`);
    return res
      .status(422)
      .json(errorBody(req, 'VALIDATION_FAILED', '数据不符合约束，请检查时间或字段长度'));
  }

  console.error(`[unhandled] reqId=${req.id ?? '-'}`, err);
  return res.status(500).json(errorBody(req, 'INTERNAL_ERROR', '服务器内部错误，请稍后重试'));
};
