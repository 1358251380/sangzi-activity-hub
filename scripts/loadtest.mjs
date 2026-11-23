/**
 * 极简压测工具（零依赖）。
 *
 * 为什么自己写：项目刻意不引入压测依赖；需求也很简单 —— 固定并发打一段时间，
 * 输出 RPS 与延迟分位数。用 Node 内置 fetch 即可。
 *
 * 用法：
 *   node scripts/loadtest.mjs <url> [--duration=8] [--concurrency=10] [--label=xxx]
 *   node scripts/loadtest.mjs http://127.0.0.1:8080/api/activities?pageSize=20 --concurrency=5
 *
 * 输出：JSON 摘要 + 人类可读一行。
 *
 * 注意：结果受运行机器影响，只用于「同一机器上的相对比较」与「发现瓶颈」，
 *       不能当成生产容量承诺。
 */

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http'));
if (!url) {
  console.error('用法: node scripts/loadtest.mjs <url> [--duration=8] [--concurrency=10] [--label=xxx] [--method=GET]');
  process.exit(1);
}

const getArg = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};

const duration = Number(getArg('duration', 8));
const concurrency = Math.max(1, Number(getArg('concurrency', 10)));
const label = getArg('label', 'run');
const method = getArg('method', 'GET').toUpperCase();
const bodyFile = getArg('bodyFile', '');

// 写请求需要请求体：从文件读（避免命令行转义地狱），并固定用 JSON
let requestInit = { method };
if (bodyFile) {
  const { readFileSync } = await import('node:fs');
  requestInit = {
    method,
    body: readFileSync(bodyFile),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  };
}

const latencies = [];
const statuses = new Map();
let errors = 0;

const deadline = Date.now() + duration * 1000;

/** 一个并发工人：持续发请求直到到点 */
async function worker() {
  while (Date.now() < deadline) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, requestInit);
      // 必须读完 body，否则连接不会释放，测出来是连接数而非吞吐
      await res.arrayBuffer();
      const ms = performance.now() - t0;
      latencies.push(ms);
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    } catch {
      errors += 1;
    }
  }
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsed = (Date.now() - startedAt) / 1000;

const sorted = [...latencies].sort((a, b) => a - b);
const pct = (p) => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(1));
};

const total = latencies.length + errors;
const summary = {
  label,
  url,
  method,
  concurrency,
  durationSeconds: Number(elapsed.toFixed(2)),
  totalRequests: total,
  ok: latencies.length,
  errors,
  statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0])),
  rps: Number((total / elapsed).toFixed(1)),
  latencyMs: {
    min: sorted.length ? Number(sorted[0].toFixed(1)) : null,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    max: sorted.length ? Number(sorted[sorted.length - 1].toFixed(1)) : null,
  },
};

console.log(JSON.stringify(summary, null, 2));
console.log(
  `[${label}] ${summary.rps} req/s | p50=${summary.latencyMs.p50}ms p95=${summary.latencyMs.p95}ms p99=${summary.latencyMs.p99}ms | ` +
    `状态=${JSON.stringify(summary.statuses)} 错误=${errors}`,
);
