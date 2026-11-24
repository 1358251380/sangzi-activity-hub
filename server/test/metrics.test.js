/**
 * Prometheus 指标测试（P2）。
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';

let db;
let workDir;
let serverOn;
let serverOff;
let onBase;
let offBase;

before(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'sangzi-metrics-'));
  db = openDatabase(join(workDir, 'app.db'));
  seed(db, { reset: true });

  const appOn = createApp({ db, logger: false, metricsEnabled: true, rateLimitOptions: { max: 0 } });
  serverOn = await new Promise((resolve) => {
    const s = appOn.listen(0, '127.0.0.1', () => resolve(s));
  });
  onBase = `http://127.0.0.1:${serverOn.address().port}`;

  const appOff = createApp({ db, logger: false, metricsEnabled: false, rateLimitOptions: { max: 0 } });
  serverOff = await new Promise((resolve) => {
    const s = appOff.listen(0, '127.0.0.1', () => resolve(s));
  });
  offBase = `http://127.0.0.1:${serverOff.address().port}`;
});

after(async () => {
  await new Promise((r) => serverOn.close(r));
  await new Promise((r) => serverOff.close(r));
  closeDatabase(db);
  rmSync(workDir, { recursive: true, force: true });
});

async function text(url) {
  const res = await fetch(url);
  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
}

test('未开启时 /metrics 返回 404（不泄露接口结构）', async () => {
  const r = await text(`${offBase}/metrics`);
  assert.equal(r.status, 404);
});

test('开启后 /metrics 返回 Prometheus 文本格式', async () => {
  const r = await text(`${onBase}/metrics`);
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/plain/);
  assert.match(r.body, /^# HELP sangzi_uptime_seconds/m);
});

test('包含约定的指标名与 TYPE 声明', async () => {
  const { body } = await text(`${onBase}/metrics`);
  for (const name of [
    'sangzi_uptime_seconds',
    'sangzi_db_up',
    'sangzi_http_requests_total',
    'sangzi_http_request_duration_seconds',
  ]) {
    assert.match(body, new RegExp(`# TYPE ${name} `), `缺少 TYPE ${name}`);
  }
  // 直方图三件套必须齐全
  assert.match(body, /sangzi_http_request_duration_seconds_bucket\{le="\+Inf"\}/);
  assert.match(body, /sangzi_http_request_duration_seconds_sum /);
  assert.match(body, /sangzi_http_request_duration_seconds_count /);
});

test('数据库可用时 db_up 为 1', async () => {
  const { body } = await text(`${onBase}/metrics`);
  assert.match(body, /^sangzi_db_up 1$/m);
});

test('请求会累加到 status 分类计数里', async () => {
  const before = await text(`${onBase}/metrics`);
  await fetch(`${onBase}/api/activities`).then((r) => r.arrayBuffer());
  const after = await text(`${onBase}/metrics`);

  const pick = (b) => {
    const m = b.match(/sangzi_http_requests_total\{method="GET",status="2xx"\} (\d+)/);
    return m ? Number(m[1]) : 0;
  };
  assert.ok(pick(after.body) > pick(before.body), '2xx 计数应增长');
});

test('4xx 也被计入对应分类', async () => {
  await fetch(`${onBase}/api/definitely-missing`).then((r) => r.arrayBuffer());
  const { body } = await text(`${onBase}/metrics`);
  assert.match(body, /sangzi_http_requests_total\{method="GET",status="4xx"\} \d+/);
});

test('直方图 count 与 sum 随请求增长', async () => {
  const pick = (b, field) => Number((b.match(new RegExp(`sangzi_http_request_duration_seconds_${field} (\\d+\\.?\\d*)`)) ?? [])[1] ?? 0);
  const a = await text(`${onBase}/metrics`);
  await fetch(`${onBase}/api/health/live`).then((r) => r.arrayBuffer());
  const b = await text(`${onBase}/metrics`);
  assert.ok(pick(b.body, 'count') > pick(a.body, 'count'));
  assert.ok(pick(b.body, 'sum') >= pick(a.body, 'sum'));
});

test('collector 语法可被解析：每行要么是注释、指标、或空行', async () => {
  const { body } = await text(`${onBase}/metrics`);
  for (const line of body.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    assert.match(line, /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? -?[\d.]+(e[+-]?\d+)?$/, `非法行: ${line}`);
  }
});
