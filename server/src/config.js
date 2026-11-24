/**
 * 配置集中加载与校验 —— fail-fast 原则。
 *
 * 为什么单独抽一个模块：
 *   原来配置散落在 index.js 里用 `Number(process.env.PORT ?? 3001)` 读，
 *   写错（PORT=abc / NODE_ENV=prod）不会报错，只会在运行时以很奇怪的方式失败。
 *   运维第一原则是「启动时就把配置校验掉」：宁可在启动阶段退出，也不要带着错配置对外服务。
 *
 * 设计要点：
 *   - 纯函数 loadConfig(env)，不读全局 process.env，可直接单测
 *   - 非法配置返回 { ok:false, errors[] }，由入口决定如何退出（便于测试）
 *   - 只做校验与归一化，不做 I/O（不建目录、不连库）
 */
import { isAbsolute, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const NODE_ENVS = ['development', 'production', 'test'];
export const LOG_FORMATS = ['json', 'text'];

/** 默认值集中在此，避免散落 */
export const DEFAULTS = {
  PORT: '3001',
  HOST: '0.0.0.0',
  NODE_ENV: 'development',
  DB_PATH: './data/app.db',
  TRUST_PROXY: '1',
  RATE_LIMIT_MAX: '120',
  RATE_LIMIT_WINDOW_MS: '60000',
  METRICS_ENABLED: 'false',
};

/**
 * 解析数据库路径。相对路径按项目根目录解析（而不是当前工作目录），
 * 保证从任何位置启动结果一致。
 * @returns {{ok:true,value:string}|{ok:false,error:string}}
 */
export function resolveDbPathFrom(raw, root = PROJECT_ROOT) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'DB_PATH 不能为空' };
  if (value === ':memory:') return { ok: true, value };
  return { ok: true, value: isAbsolute(value) ? value : resolve(root, value) };
}

/**
 * 解析 Express 的 trust proxy 设置。
 * 只接受可预期的取值，避免把拼错的字符串透传给 Express 导致运行时才报错。
 * 支持 true / false / 跳数(0-10) / 预设名。
 */
export const TRUST_PROXY_PRESETS = ['loopback', 'linklocal', 'uniquelocal'];

export function parseTrustProxy(raw) {
  const value = String(raw ?? DEFAULTS.TRUST_PROXY).trim();
  if (value === 'true') return { ok: true, value: true };
  if (value === 'false') return { ok: true, value: false };
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return n >= 0 && n <= 10
      ? { ok: true, value: n }
      : { ok: false, error: `TRUST_PROXY 跳数应在 0-10 之间，当前值: ${JSON.stringify(raw)}` };
  }
  if (TRUST_PROXY_PRESETS.includes(value.toLowerCase())) {
    return { ok: true, value: value.toLowerCase() };
  }
  return {
    ok: false,
    error: `TRUST_PROXY 取值非法（可用 true / false / 0-10 / ${TRUST_PROXY_PRESETS.join(' / ')}），当前值: ${JSON.stringify(raw)}`,
  };
}

/**
 * 加载并校验配置。
 * @param {Record<string,string|undefined>} [env]
 * @returns {{ok:true,value:object}|{ok:false,errors:string[]}}
 */
export function loadConfig(env = process.env) {
  const errors = [];

  // ---- PORT ----
  const rawPort = String(env.PORT ?? DEFAULTS.PORT).trim();
  let PORT = 0;
  if (!/^\d{1,5}$/.test(rawPort)) {
    errors.push(`PORT 必须是 1-65535 的整数，当前值: ${JSON.stringify(env.PORT)}`);
  } else {
    PORT = Number(rawPort);
    if (PORT < 1 || PORT > 65535) {
      errors.push(`PORT 超出合法范围 1-65535，当前值: ${PORT}`);
    }
  }

  // ---- NODE_ENV ----
  const NODE_ENV = String(env.NODE_ENV ?? DEFAULTS.NODE_ENV).trim();
  if (!NODE_ENVS.includes(NODE_ENV)) {
    errors.push(`NODE_ENV 必须是 ${NODE_ENVS.join(' / ')} 之一，当前值: ${JSON.stringify(env.NODE_ENV)}`);
  }

  // ---- HOST ----
  const HOST = String(env.HOST ?? DEFAULTS.HOST).trim() || DEFAULTS.HOST;

  // ---- DB_PATH ----
  const db = resolveDbPathFrom(env.DB_PATH ?? DEFAULTS.DB_PATH);
  if (!db.ok) errors.push(db.error);

  // ---- LOG_FORMAT（生产默认 json，开发默认 text）----
  const LOG_FORMAT = String(
    env.LOG_FORMAT ?? (NODE_ENV === 'production' ? 'json' : 'text'),
  )
    .trim()
    .toLowerCase();
  if (!LOG_FORMATS.includes(LOG_FORMAT)) {
    errors.push(`LOG_FORMAT 必须是 ${LOG_FORMATS.join(' / ')} 之一，当前值: ${JSON.stringify(env.LOG_FORMAT)}`);
  }

  // ---- TRUST_PROXY ----
  const trust = parseTrustProxy(env.TRUST_PROXY);
  if (!trust.ok) errors.push(trust.error);

  // ---- CORS_ORIGIN（可空；生产同源无需设置）----
  const CORS_ORIGIN = String(env.CORS_ORIGIN ?? '').trim();
  if (CORS_ORIGIN && !/^https?:\/\/[^\s]+$/i.test(CORS_ORIGIN)) {
    errors.push(`CORS_ORIGIN 需为 http(s):// 开头的来源，当前值: ${JSON.stringify(env.CORS_ORIGIN)}`);
  }

  // ---- 应用层限流 ----
  const rawMax = String(env.RATE_LIMIT_MAX ?? DEFAULTS.RATE_LIMIT_MAX).trim();
  let RATE_LIMIT_MAX = 0;
  if (!/^\d+$/.test(rawMax)) {
    errors.push(`RATE_LIMIT_MAX 必须是非负整数（0 表示关闭限流），当前值: ${JSON.stringify(env.RATE_LIMIT_MAX)}`);
  } else {
    RATE_LIMIT_MAX = Number(rawMax);
  }

  const rawWindow = String(env.RATE_LIMIT_WINDOW_MS ?? DEFAULTS.RATE_LIMIT_WINDOW_MS).trim();
  let RATE_LIMIT_WINDOW_MS = 0;
  if (!/^\d+$/.test(rawWindow) || Number(rawWindow) < 1000) {
    errors.push(
      `RATE_LIMIT_WINDOW_MS 必须是不小于 1000 的整数，当前值: ${JSON.stringify(env.RATE_LIMIT_WINDOW_MS)}`,
    );
  } else {
    RATE_LIMIT_WINDOW_MS = Number(rawWindow);
  }

  // ---- METRICS_ENABLED（默认关闭：指标会泄露接口结构，需显式开启）----
  const rawMetrics = String(env.METRICS_ENABLED ?? DEFAULTS.METRICS_ENABLED).trim().toLowerCase();
  let METRICS_ENABLED = false;
  if (rawMetrics === 'true') METRICS_ENABLED = true;
  else if (rawMetrics !== 'false') {
    errors.push(`METRICS_ENABLED 只能是 true / false，当前值: ${JSON.stringify(env.METRICS_ENABLED)}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      PORT,
      HOST,
      NODE_ENV,
      DB_PATH: db.value,
      LOG_FORMAT,
      TRUST_PROXY: trust.value,
      CORS_ORIGIN,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
      METRICS_ENABLED,
      PROJECT_ROOT,
      IS_PRODUCTION: NODE_ENV === 'production',
    },
  };
}

/** 把校验错误格式化成可直接打印的文本 */
export function formatConfigErrors(errors) {
  return [
    '配置校验失败，服务拒绝启动（fail-fast）：',
    ...errors.map((e) => `  - ${e}`),
    '',
    '请对照 .env.example 修正环境变量后重试。',
  ].join('\n');
}
