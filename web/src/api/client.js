/**
 * API 客户端。
 *
 * 设计要点：
 * - 统一以相对路径 /api 请求。开发期由 Vite proxy 转发到 3001，
 *   生产期由后端单端口托管，同一份代码两边都能跑，不需要环境变量区分配置。
 * - 错误统一抛 ApiError，携带 status / code / fields，方便表单逐字段展示。
 */

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {any} payload 服务端返回体
   */
  constructor(status, payload) {
    const message = payload?.error?.message ?? `请求失败（HTTP ${status}）`;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.error?.code ?? 'UNKNOWN';
    this.fields = payload?.error?.fields ?? null;
  }
}

const BASE = '/api';

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, { error: { code: 'NETWORK_ERROR', message: '网络异常，无法连接服务器' } });
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

/** 把筛选对象拼成 query string，跳过空值 */
function toQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const api = {
  health: () => request('/health'),

  options: () => request('/meta/options'),

  listActivities: (params) => request(`/activities${toQuery(params)}`),

  getActivity: (id) => request(`/activities/${id}`),

  createActivity: (payload) => request('/activities', { method: 'POST', body: payload }),

  updateActivity: (id, payload) =>
    request(`/activities/${id}`, { method: 'PATCH', body: payload }),

  deleteActivity: (id) => request(`/activities/${id}`, { method: 'DELETE' }),

  listComments: (id) => request(`/activities/${id}/comments`),

  createComment: (id, payload) =>
    request(`/activities/${id}/comments`, { method: 'POST', body: payload }),

  timeline: (params) => request(`/timeline${toQuery(params)}`),
};
