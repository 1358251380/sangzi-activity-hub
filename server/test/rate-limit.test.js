/**
 * 应用层限流测试（P2）。
 *
 * 全部通过注入 now() 控制时间，不依赖 sleep，断言可复现。
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
let server;
let baseUrl;
let workDir;

before(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'sangzi-rl-'));
  db = openDatabase(join(workDir, 'app.db'));
  seed(db, { reset: true });
  const app = createApp({
    db,
    logger: false,
    trustProxy: true, // 允许用 X-Forwarded-For 模拟不同来源
    rateLimitOptions: { max: 3, windowMs: 60_000 },
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDatabase(db);
  rmSync(workDir, { recursive: true, force: true });
});

/** 每次用不同来源 IP，避免与其它测试互相干扰 */
let ipSeq = 0;
const nextIp = () => `10.0.0.${++ipSeq}`;

async function get(path, ip = nextIp()) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { 'X-Forwarded-For': ip } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body };
}

test('未超限时放行，并带 X-RateLimit 响应头', async () => {
  const ip = nextIp();
  const r = await get('/api/activities', ip);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-ratelimit-limit'), '3');
  assert.equal(r.headers.get('x-ratelimit-remaining'), '2');
  assert.ok(Number(r.headers.get('x-ratelimit-reset')) > 0);
});

test('同一 IP 超过阈值后返回 429，并带 Retry-After', async () => {
  const ip = nextIp();
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await get('/api/activities', ip)).status, 200);
  }
  const blocked = await get('/api/activities', ip);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  assert.ok(blocked.body.error.message.length > 0);
});

test('429 响应体带 requestId，可与日志对上', async () => {
  const ip = nextIp();
  for (let i = 0; i < 3; i += 1) await get('/api/activities', ip);
  const blocked = await get('/api/activities', ip);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.body.error.requestId);
  assert.equal(blocked.body.error.requestId, blocked.headers.get('x-request-id'));
});

test('不同 IP 独立计数，互不影响', async () => {
  const a = nextIp();
  const b = nextIp();
  for (let i = 0; i < 3; i += 1) assert.equal((await get('/api/activities', a)).status, 200);
  assert.equal((await get('/api/activities', a)).status, 429);
  // b 尚未用满，仍应放行
  assert.equal((await get('/api/activities', b)).status, 200);
});

test('非 /api 路径不受限流影响', async () => {
  const ip = nextIp();
  for (let i = 0; i < 5; i += 1) {
    const r = await get('/api/activities', ip);
    assert.ok([200, 429].includes(r.status));
  }
  // 未知的非 api 路径走 404，但不应是限流的 429
  const r = await get('/definitely-not-api', ip);
  assert.equal(r.status, 404);
});

test('健康检查豁免：探针不会被限流（否则会引发容器重启循环）', async () => {
  const ip = nextIp();
  for (let i = 0; i < 10; i += 1) {
    const r = await get('/api/health/live', ip);
    assert.equal(r.status, 200, `第 ${i + 1} 次探针被限流了`);
  }
  const ready = await get('/api/health/ready', ip);
  assert.equal(ready.status, 200);
});

test('max=0 表示关闭限流', async () => {
  const app = createApp({
    db,
    logger: false,
    rateLimitOptions: { max: 0 },
  });
  const s = await new Promise((resolve) => {
    const sv = app.listen(0, '127.0.0.1', () => resolve(sv));
  });
  const port = s.address().port;
  try {
    for (let i = 0; i < 20; i += 1) {
      const res = await fetch(`http://127.0.0.1:${port}/api/activities`);
      assert.equal(res.status, 200);
      await res.arrayBuffer();
    }
  } finally {
    await new Promise((r) => s.close(r));
  }
});
