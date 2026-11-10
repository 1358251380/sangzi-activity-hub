/**
 * API 集成测试：真实起 HTTP 服务 + 内存数据库，覆盖 P0 全链路。
 * 对应 docs/01 验收标准与 docs/02 接口设计。
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';

let db;
let server;
let baseUrl;

/** 简易请求封装 */
async function api(path, init) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const json = (obj) => ({ body: JSON.stringify(obj) });

before(async () => {
  db = openDatabase(':memory:');
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
});

// ---------------- 健康检查 ----------------

test('GET /api/health 返回 200 且数据库正常', async () => {
  const r = await api('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.db, 'ok');
  assert.ok(r.body.uptime >= 0);
});

// ---------------- 列表 / 搜索 / 筛选 ----------------

test('GET /api/activities 返回分页结构与派生字段', async () => {
  const r = await api('/api/activities');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(r.body.total >= 14, '种子数据至少 14 条');
  assert.equal(r.body.page, 1);

  const item = r.body.items[0];
  for (const key of [
    'id',
    'title',
    'type',
    'publisherType',
    'publisherName',
    'audience',
    'startAt',
    'endAt',
    'signupDeadline',
    'status',
    'signupOpen',
    'commentCount',
  ]) {
    assert.ok(key in item, `缺少字段 ${key}`);
  }
  assert.ok(['signup_open', 'signup_closed', 'ongoing', 'ended'].includes(item.status));
});

test('关键词搜索命中标题', async () => {
  const r = await api('/api/activities?q=' + encodeURIComponent('程序设计'));
  assert.equal(r.status, 200);
  assert.ok(r.body.total >= 1);
  assert.ok(r.body.items.every((a) => a.title.includes('程序设计') || a.description.includes('程序设计')));
});

test('关键词搜索命中介绍正文', async () => {
  const r = await api('/api/activities?q=' + encodeURIComponent('B+ 树'));
  assert.equal(r.status, 200);
  assert.ok(r.body.total >= 1, '应能通过介绍文本搜到');
});

test('LIKE 通配符被转义，不会匹配全部', async () => {
  const all = await api('/api/activities');
  const wild = await api('/api/activities?q=%25');
  assert.equal(wild.status, 200);
  assert.ok(wild.body.total < all.body.total, '% 应按字面量匹配');
});

test('按活动类型筛选', async () => {
  const r = await api('/api/activities?type=contest');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((a) => a.type === 'contest'));
  assert.ok(r.body.total >= 3);
});

test('多类型筛选（逗号分隔）', async () => {
  const r = await api('/api/activities?type=contest,lecture');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((a) => ['contest', 'lecture'].includes(a.type)));
});

test('按发布者类型筛选', async () => {
  const r = await api('/api/activities?publisherType=personal');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((a) => a.publisherType === 'personal'));
  assert.ok(r.body.total >= 2);
});

test('条件可组合', async () => {
  const r = await api('/api/activities?type=contest&publisherType=college');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((a) => a.type === 'contest' && a.publisherType === 'college'));
});

test('按状态筛选：ended 全部确实已结束', async () => {
  const r = await api('/api/activities?status=ended');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((a) => a.status === 'ended'));
});

test('分页可用且 total 不受分页影响', async () => {
  const p1 = await api('/api/activities?pageSize=5&page=1');
  const p2 = await api('/api/activities?pageSize=5&page=2');
  assert.equal(p1.body.items.length, 5);
  assert.equal(p1.body.total, p2.body.total);
  const ids1 = new Set(p1.body.items.map((a) => a.id));
  assert.ok(p2.body.items.every((a) => !ids1.has(a.id)), '两页不应有重复');
});

// ---------------- 详情 ----------------

test('GET /api/activities/:id 返回详情', async () => {
  const list = await api('/api/activities?pageSize=1');
  const id = list.body.items[0].id;
  const r = await api(`/api/activities/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, id);
  assert.ok(r.body.description.length > 0);
});

test('GET /api/activities/:id 不存在返回 404', async () => {
  const r = await api('/api/activities/999999');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
});

test('GET /api/activities/abc 非法 ID 返回 400', async () => {
  const r = await api('/api/activities/abc');
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'BAD_REQUEST');
});

// ---------------- 发布 ----------------

const newActivity = () => ({
  title: '测试用活动',
  type: 'lecture',
  publisherType: 'personal',
  publisherName: '测试同学',
  audience: '全校',
  startAt: '2026-12-01T09:00:00+08:00',
  endAt: '2026-12-02T18:00:00+08:00',
  signupDeadline: '2026-11-28T23:59:00+08:00',
  description: '这是一条由集成测试创建的活动。',
});

test('POST /api/activities 创建成功返回 201 与派生字段', async () => {
  const r = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  assert.equal(r.status, 201);
  assert.equal(r.body.title, '测试用活动');
  assert.equal(r.body.startAt, '2026-12-01T01:00:00.000Z', '应归一化为 UTC');
  assert.equal(r.body.status, 'signup_open');
  assert.equal(r.body.signupOpen, true);
  assert.equal(r.body.commentCount, 0);
  assert.ok(r.body.id > 0);
});

test('POST 校验失败返回 422 与逐字段错误', async () => {
  const r = await api('/api/activities', {
    method: 'POST',
    ...json({ ...newActivity(), title: '', endAt: '2026-11-01T09:00:00+08:00' }),
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'VALIDATION_FAILED');
  assert.ok(r.body.error.fields.title);
  assert.equal(r.body.error.fields.endAt, '结束时间不能早于开始时间');
});

test('POST 非法 JSON 返回 400', async () => {
  const res = await fetch(`${baseUrl}/api/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  });
  assert.equal(res.status, 400);
});

// ---------------- 评论 ----------------

test('评论：发表后可在列表中查到，且活动 commentCount 增加', async () => {
  const created = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  const id = created.body.id;

  const post = await api(`/api/activities/${id}/comments`, {
    method: 'POST',
    ...json({ nickname: '阿哲', content: '报名需要提交一份作品说明。' }),
  });
  assert.equal(post.status, 201);
  assert.equal(post.body.nickname, '阿哲');
  assert.ok(post.body.createdAt);

  const list = await api(`/api/activities/${id}/comments`);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].content, '报名需要提交一份作品说明。');

  const detail = await api(`/api/activities/${id}`);
  assert.equal(detail.body.commentCount, 1);
});

test('评论：内容为空返回 422', async () => {
  const created = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  const r = await api(`/api/activities/${created.body.id}/comments`, {
    method: 'POST',
    ...json({ nickname: '小林', content: '   ' }),
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.error.fields.content);
});

test('评论：活动不存在返回 404', async () => {
  const r = await api('/api/activities/999999/comments', {
    method: 'POST',
    ...json({ nickname: '小林', content: '随便写点' }),
  });
  assert.equal(r.status, 404);
});

test('评论：按时间倒序返回', async () => {
  const created = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  const id = created.body.id;
  for (const c of ['第一条', '第二条', '第三条']) {
    await api(`/api/activities/${id}/comments`, {
      method: 'POST',
      ...json({ nickname: '测试', content: c }),
    });
  }
  const list = await api(`/api/activities/${id}/comments`);
  assert.equal(list.body.items.length, 3);
  // 新的在前：最后插入的"第三条"应排在前面
  assert.equal(list.body.items[0].content, '第三条');
});

// ---------------- 编辑 / 删除 ----------------

test('PATCH 部分更新成功', async () => {
  const created = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  const r = await api(`/api/activities/${created.body.id}`, {
    method: 'PATCH',
    ...json({ title: '改名后的活动' }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, '改名后的活动');
  assert.equal(r.body.publisherName, '测试同学', '未传字段应保持不变');
});

test('PATCH 造成时间非法时返回 422', async () => {
  const created = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  const r = await api(`/api/activities/${created.body.id}`, {
    method: 'PATCH',
    ...json({ endAt: '2020-01-01T00:00:00+08:00' }),
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.fields.endAt, '结束时间不能早于开始时间');
});

test('DELETE 成功返回 204，再查为 404，评论级联删除', async () => {
  const created = await api('/api/activities', { method: 'POST', ...json(newActivity()) });
  const id = created.body.id;
  await api(`/api/activities/${id}/comments`, {
    method: 'POST',
    ...json({ nickname: '测试', content: '会被级联删掉' }),
  });

  const del = await api(`/api/activities/${id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  const after = await api(`/api/activities/${id}`);
  assert.equal(after.status, 404);

  const orphan = db.prepare('SELECT COUNT(*) AS n FROM comments WHERE activity_id = ?').get(id);
  assert.equal(Number(orphan.n), 0, '评论应被外键级联删除');
});

// ---------------- 时间轴接口 ----------------

test('GET /api/timeline 缺少 from/to 返回 400', async () => {
  const r = await api('/api/timeline');
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'BAD_REQUEST');
});

test('GET /api/timeline to 早于 from 返回 400', async () => {
  const r = await api('/api/timeline?from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z');
  assert.equal(r.status, 400);
});

test('GET /api/timeline 只返回与窗口有交集的活动', async () => {
  const from = '2026-11-01T00:00:00.000Z';
  const to = '2026-12-01T00:00:00.000Z';
  const r = await api(`/api/timeline?from=${from}&to=${to}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length > 0);
  for (const a of r.body.items) {
    assert.ok(Date.parse(a.startAt) < Date.parse(to), '活动须在窗口结束前开始');
    assert.ok(Date.parse(a.endAt) > Date.parse(from), '活动须在窗口开始后结束');
  }
});

test('时间轴接口不受分页影响', async () => {
  const r = await api('/api/timeline?from=2026-01-01T00:00:00Z&to=2027-12-31T00:00:00Z&pageSize=1');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length > 1, '应用全部返回而非 pageSize 条');
});

// ---------------- 其它 ----------------

test('GET /api/meta/options 返回枚举字典', async () => {
  const r = await api('/api/meta/options');
  assert.equal(r.status, 200);
  assert.ok(r.body.activityTypes.length === 5);
  assert.ok(r.body.publisherTypes.length === 3);
  assert.ok(r.body.activityTypes.every((t) => t.value && t.label));
});

test('未知接口返回结构化 404', async () => {
  const r = await api('/api/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
});

test('安全响应头：不暴露 x-powered-by', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('x-powered-by'), null);
});
