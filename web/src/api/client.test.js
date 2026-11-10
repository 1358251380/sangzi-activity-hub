/**
 * API 客户端测试。
 *
 * 通过替换 globalThis.fetch 来验证：
 *   - 查询参数拼装（数组、空值、编码）
 *   - 错误到 ApiError 的映射（422 逐字段、网络异常、404）
 *   - 204 无内容
 */
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, api } from './client.js';

const realFetch = globalThis.fetch;

/** 记录最后一次请求，并按 handler 返回伪响应 */
let lastCall;
function mockFetch(handler) {
  lastCall = null;
  globalThis.fetch = async (url, init) => {
    lastCall = { url, init };
    return handler(url, init);
  };
}

/** 构造伪 Response */
function res({ status = 200, ok = true, body = null } = {}) {
  return {
    ok,
    status,
    text: async () => (body === null ? '' : JSON.stringify(body)),
  };
}

beforeEach(() => {
  lastCall = null;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ---------------- 查询参数拼装 ----------------

test('无参数时不带 query string', async () => {
  mockFetch(() => res({ body: { items: [], total: 0 } }));
  await api.listActivities();
  assert.equal(lastCall.url, '/api/activities');
});

test('空字符串、null、undefined 参数被跳过', async () => {
  mockFetch(() => res({ body: { items: [], total: 0 } }));
  await api.listActivities({ q: '', type: null, publisherType: undefined, page: 1 });
  assert.equal(lastCall.url, '/api/activities?page=1');
});

test('数组参数用逗号连接', async () => {
  mockFetch(() => res({ body: { items: [], total: 0 } }));
  await api.listActivities({ type: ['lecture', 'contest'] });
  assert.ok(lastCall.url.includes('type=lecture%2Ccontest'), `实际 URL: ${lastCall.url}`);
});

test('空数组参数被跳过', async () => {
  mockFetch(() => res({ body: { items: [], total: 0 } }));
  await api.listActivities({ type: [] });
  assert.equal(lastCall.url, '/api/activities');
});

test('关键词做 URL 编码', async () => {
  mockFetch(() => res({ body: { items: [], total: 0 } }));
  await api.listActivities({ q: '程序设计 竞赛' });
  assert.ok(lastCall.url.includes('q=%E7%A8%8B%E5%BA%8F%E8%AE%BE%E8%AE%A1+%E7%AB%9E%E8%B5%9B'), lastCall.url);
});

test('时间轴接口把 from / to 传出去', async () => {
  mockFetch(() => res({ body: { from: 'a', to: 'b', items: [] } }));
  await api.timeline({ from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' });
  assert.ok(lastCall.url.startsWith('/api/timeline?'));
  assert.ok(lastCall.url.includes('from='));
  assert.ok(lastCall.url.includes('to='));
});

// ---------------- 请求方法与请求体 ----------------

test('createActivity 使用 POST 并序列化请求体', async () => {
  mockFetch(() => res({ status: 201, body: { id: 1 } }));
  await api.createActivity({ title: '测试' });
  assert.equal(lastCall.init.method, 'POST');
  assert.equal(lastCall.init.headers['Content-Type'], 'application/json');
  assert.equal(lastCall.init.body, JSON.stringify({ title: '测试' }));
});

test('updateActivity 使用 PATCH', async () => {
  mockFetch(() => res({ body: { id: 1 } }));
  await api.updateActivity(7, { title: 'x' });
  assert.equal(lastCall.init.method, 'PATCH');
  assert.equal(lastCall.url, '/api/activities/7');
});

test('deleteActivity 使用 DELETE，204 返回 null', async () => {
  mockFetch(() => ({ ok: true, status: 204, text: async () => '' }));
  const result = await api.deleteActivity(7);
  assert.equal(lastCall.init.method, 'DELETE');
  assert.equal(result, null);
});

test('GET 请求不带 body 与 Content-Type', async () => {
  mockFetch(() => res({ body: {} }));
  await api.getActivity(1);
  assert.equal(lastCall.init.body, undefined);
  assert.equal(lastCall.init.headers, undefined);
});

// ---------------- 错误映射 ----------------

test('422 映射成 ApiError，携带 code 与逐字段错误', async () => {
  mockFetch(() =>
    res({
      status: 422,
      ok: false,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: '表单校验未通过',
          fields: { endAt: '结束时间不能早于开始时间' },
        },
      },
    }),
  );

  await assert.rejects(
    () => api.createActivity({}),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 422);
      assert.equal(err.code, 'VALIDATION_FAILED');
      assert.equal(err.message, '表单校验未通过');
      assert.equal(err.fields.endAt, '结束时间不能早于开始时间');
      return true;
    },
  );
});

test('404 映射成 ApiError，fields 为 null', async () => {
  mockFetch(() =>
    res({ status: 404, ok: false, body: { error: { code: 'NOT_FOUND', message: '活动不存在' } } }),
  );

  await assert.rejects(
    () => api.getActivity(999),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'NOT_FOUND');
      assert.equal(err.fields, null);
      return true;
    },
  );
});

test('网络异常映射成 NETWORK_ERROR，而不是直接抛出原始错误', async () => {
  mockFetch(() => {
    throw new TypeError('Failed to fetch');
  });

  await assert.rejects(
    () => api.health(),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, 'NETWORK_ERROR');
      assert.equal(err.status, 0);
      return true;
    },
  );
});

test('AbortError 原样抛出，方便调用方区分取消', async () => {
  mockFetch(() => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  });

  await assert.rejects(
    () => api.health(),
    (err) => {
      assert.equal(err.name, 'AbortError');
      return true;
    },
  );
});

test('响应体不是合法 JSON 时不崩溃，按失败处理', async () => {
  mockFetch(() => ({ ok: false, status: 500, text: async () => '<html>500</html>' }));

  await assert.rejects(
    () => api.health(),
    (err) => {
      assert.equal(err.status, 500);
      assert.equal(err.code, 'UNKNOWN');
      return true;
    },
  );
});
