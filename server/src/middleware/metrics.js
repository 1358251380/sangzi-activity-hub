/**
 * Prometheus 指标采集（零依赖）。
 *
 * 为什么需要：日志能回答「刚才发生了什么」，指标能回答「现在整体健康吗、有没有变慢」。
 * 两者互补 —— 前者用于排障，后者用于发现趋势与告警。
 *
 * 暴露的指标（Prometheus 文本格式）：
 *   sangzi_uptime_seconds                      进程存活时长
 *   sangzi_http_requests_total{method,status}  按方法与状态码分类的请求数
 *   sangzi_http_request_duration_seconds_*     请求耗时直方图（含 sum / count）
 *   sangzi_db_up                               数据库可用性（1/0）
 *
 * 安全：默认不开启（METRICS_ENABLED=false）。指标会泄露接口结构与流量特征，
 * 不应默认对公网暴露；需要采集时由运维显式打开。
 */

const BUCKETS_SEC = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

const statusClass = (code) => {
  if (code >= 500) return '5xx';
  if (code >= 400) return '4xx';
  if (code >= 300) return '3xx';
  return '2xx';
};

/** Prometheus 文本格式要求标签值转义 */
const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

export function createMetrics() {
  const startedAt = Date.now();
  /** @type {Map<string, number>} key: `${method}|${statusClass}` */
  const requests = new Map();
  let durationSum = 0;
  let durationCount = 0;
  /** 每个桶的累计计数（Prometheus 直方图的 bucket 必须是累计值） */
  const bucketCounts = new Array(BUCKETS_SEC.length).fill(0);

  const middleware = (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const sec = Number(process.hrtime.bigint() - started) / 1e9;
      const key = `${req.method}|${statusClass(res.statusCode)}`;
      requests.set(key, (requests.get(key) ?? 0) + 1);

      durationSum += sec;
      durationCount += 1;
      for (let i = 0; i < BUCKETS_SEC.length; i += 1) {
        if (sec <= BUCKETS_SEC[i]) bucketCounts[i] += 1;
      }
    });
    next();
  };

  /**
   * @param {{dbUp:boolean}} state
   * @returns {string} Prometheus exposition 文本
   */
  const render = ({ dbUp }) => {
    const lines = [];
    const push = (...l) => lines.push(...l);

    push('# HELP sangzi_uptime_seconds 进程启动至今的秒数', '# TYPE sangzi_uptime_seconds gauge');
    push(`sangzi_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(1)}`);

    push('# HELP sangzi_db_up 数据库是否可用（1=是，0=否）', '# TYPE sangzi_db_up gauge');
    push(`sangzi_db_up ${dbUp ? 1 : 0}`);

    push(
      '# HELP sangzi_http_requests_total 已处理的 HTTP 请求总数',
      '# TYPE sangzi_http_requests_total counter',
    );
    if (requests.size === 0) {
      push('sangzi_http_requests_total{method="none",status="none"} 0');
    } else {
      for (const [key, count] of [...requests.entries()].sort()) {
        const [method, status] = key.split('|');
        push(`sangzi_http_requests_total{method="${esc(method)}",status="${esc(status)}"} ${count}`);
      }
    }

    push(
      '# HELP sangzi_http_request_duration_seconds HTTP 请求耗时分布',
      '# TYPE sangzi_http_request_duration_seconds histogram',
    );
    for (let i = 0; i < BUCKETS_SEC.length; i += 1) {
      push(
        `sangzi_http_request_duration_seconds_bucket{le="${BUCKETS_SEC[i]}"} ${bucketCounts[i]}`,
      );
    }
    push(`sangzi_http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`);
    push(`sangzi_http_request_duration_seconds_sum ${durationSum.toFixed(6)}`);
    push(`sangzi_http_request_duration_seconds_count ${durationCount}`);

    return `${lines.join('\n')}\n`;
  };

  return { middleware, render };
}
