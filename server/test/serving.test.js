/**
 * 静态资源托管与可观测性测试（P0 ② 请求 ID / ③ 缓存分层 + gzip）。
 *
 * 关键设计：**不用真实的 web/dist**，而是在临时目录里造一份最小产物。
 *   - 否则测试会依赖「先 npm run build」，CI 里顺序稍变就会挂
 *   - 同时也说明这些行为属于服务端逻辑，不该和前端构建耦合
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';

let db;
let server;
let baseUrl;
let port;
let staticDir;

/** 用 fetch 取响应（自动解码，用于普通断言） */
async function api(path, init) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body };
}

/** 原始 HTTP 请求（保留 Content-Encoding 与压缩后的字节，用于 gzip 断言） */
function rawGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  // 造一份最小前端产物：index.html + assets/（带内容哈希的文件名）
  staticDir = mkdtempSync(join(tmpdir(), 'sangzi-static-'));
  mkdirSync(join(staticDir, 'assets'), { recursive: true });
  writeFileSync(
    join(staticDir, 'index.html'),
    '<!doctype html><html><body><div id="root"></div><script src="/assets/app-abc123.js"></script></body></html>',
  );
  writeFileSync(join(staticDir, 'assets', 'app-abc123.js'), 'console.log("asset");');
  writeFileSync(join(staticDir, 'assets', 'app-abc123.css'), 'body{color:#000}');

  db = openDatabase(':memory:');
  seed(db, { reset: true });

  const app = createApp({ db, logger: false, staticDir });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDatabase(db);
  rmSync(staticDir, { recursive: true, force: true });
});

// ---------------- ② 请求 ID ----------------

test('每个响应都带 X-Request-Id', async () => {
  const r = await api('/api/health');
  const id = r.headers.get('x-request-id');
  assert.ok(id, '缺少 X-Request-Id 响应头');
  assert.match(id, /^[A-Za-z0-9._-]{8,64}$/);
});

test('上游传入合法 X-Request-Id 时被复用（便于跨服务串联）', async () => {
  const r = await api('/api/health', { headers: { 'X-Request-Id': 'edge-node-01-abc123' } });
  assert.equal(r.headers.get('x-request-id'), 'edge-node-01-abc123');
});

test('上游传入非法 X-Request-Id 时不复用，改为自生成', async () => {
  // 注意：HTTP 头必须是 ASCII（ByteString），所以用「短且含空格」构造非法值
  const bad = 'bad id';
  const r = await api('/api/health', { headers: { 'X-Request-Id': bad } });
  const id = r.headers.get('x-request-id');
  assert.notEqual(id, bad);
  assert.match(id, /^[A-Za-z0-9._-]{8,64}$/);
});

test('404 错误体中带 requestId，且与响应头一致', async () => {
  const r = await api('/api/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
  assert.ok(r.body.error.requestId);
  assert.equal(r.body.error.requestId, r.headers.get('x-request-id'));
});

test('422 校验失败体中也带 requestId', async () => {
  const r = await api('/api/activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' }),
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.error.requestId);
  assert.equal(r.body.error.requestId, r.headers.get('x-request-id'));
});

test('两个请求的 requestId 不同', async () => {
  const a = await api('/api/health');
  const b = await api('/api/health');
  assert.notEqual(a.headers.get('x-request-id'), b.headers.get('x-request-id'));
});

// ---------------- ③ 静态资源缓存分层 ----------------

test('/assets/* 返回长期不可变缓存（带内容哈希，可永久缓存）', async () => {
  const r = await api('/assets/app-abc123.js');
  assert.equal(r.status, 200);
  const cc = r.headers.get('cache-control');
  assert.match(cc, /immutable/);
  assert.match(cc, /max-age=31536000/);
});

test('index.html 返回 no-cache（发版后必须立刻拿到新页面）', async () => {
  const r = await api('/index.html');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
});

test('SPA 兜底返回的 index.html 也是 no-cache', async () => {
  const r = await api('/timeline');
  assert.equal(r.status, 200);
  assert.match(r.body, /app-abc123\.js/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
});

test('未知 API 仍返回 JSON 404，不被 SPA 兜底吞掉', async () => {
  const r = await api('/api/does-not-exist');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
});

// ---------------- ③ JSON gzip ----------------

test('Accept-Encoding: gzip 时 JSON 响应被 gzip 压缩且可正确解压', async () => {
  const r = await rawGet('/api/activities?pageSize=20', { 'Accept-Encoding': 'gzip' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.match(String(r.headers['vary']), /Accept-Encoding/i);

  const plain = gunzipSync(r.body).toString('utf8');
  const parsed = JSON.parse(plain);
  assert.ok(Array.isArray(parsed.items));
  assert.ok(parsed.total >= 14);
});

test('客户端不支持 gzip 时不压缩', async () => {
  const r = await rawGet('/api/activities?pageSize=20', { 'Accept-Encoding': 'identity' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], undefined);
  const parsed = JSON.parse(r.body.toString('utf8'));
  assert.ok(parsed.items.length > 0);
});

test('小体积 JSON 不压缩（压缩收益小于开销）', async () => {
  const r = await rawGet('/api/health', { 'Accept-Encoding': 'gzip' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], undefined);
});

test('HTML 响应不被这个中间件压缩（静态资源交给反代处理）', async () => {
  const r = await rawGet('/index.html', { 'Accept-Encoding': 'gzip' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], undefined);
});
