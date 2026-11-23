/**
 * 健康检查分层测试（P1 ⑥）。
 *
 * 核心断言：数据库挂掉时
 *   - liveness 仍返回 200  → 容器「活着」，不该被重启
 *   - readiness 返回 503   → 流量该被摘走
 * 这正是把两个探针分开的意义；混用会把一次数据库抖动放大成重启风暴。
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
  workDir = mkdtempSync(join(tmpdir(), 'sangzi-health-'));
  db = openDatabase(join(workDir, 'app.db'));
  seed(db, { reset: true });
  const app = createApp({ db, logger: false });
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

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('数据库正常时：live / ready / 聚合 全部 200', async () => {
  const live = await get('/api/health/live');
  assert.equal(live.status, 200);
  assert.equal(live.body.status, 'alive');

  const ready = await get('/api/health/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.db, 'ok');

  const agg = await get('/api/health');
  assert.equal(agg.status, 200);
  assert.equal(agg.body.db, 'ok');
});

test('liveness 不暴露数据库细节（它不该依赖外部资源）', async () => {
  const live = await get('/api/health/live');
  assert.equal(live.body.db, undefined, 'liveness 不应包含 db 字段');
});

test('liveness 带 uptime 与时间戳', async () => {
  const live = await get('/api/health/live');
  assert.equal(typeof live.body.uptime, 'number');
  assert.ok(!Number.isNaN(Date.parse(live.body.time)));
});

test('数据库关闭后：live 仍 200，ready 返回 503', async () => {
  closeDatabase(db); // 模拟数据库不可用

  const live = await get('/api/health/live');
  assert.equal(live.status, 200, 'liveness 必须保持 200，否则会被误判为需要重启');
  assert.equal(live.body.status, 'alive');

  const ready = await get('/api/health/ready');
  assert.equal(ready.status, 503, 'readiness 必须降级');
  assert.equal(ready.body.db, 'error');
  assert.equal(ready.body.status, 'degraded');

  const agg = await get('/api/health');
  assert.equal(agg.status, 503);
});

test('ready 降级时业务接口不应返回 200', async () => {
  const r = await get('/api/activities');
  assert.notEqual(r.status, 200);
});
