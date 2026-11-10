/**
 * 「我的发布」本地记录测试。
 *
 * myPublish.js 直接读写 window.localStorage，所以这里注入一个内存版 localStorage，
 * 不依赖浏览器环境。
 */

/** 内存版 localStorage */
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

// 必须在注入 window 之后再导入模块
const { addMyId, getMyIds, isMine, removeMyId } = await import('./myPublish.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'sangzi:my-activities';

test.beforeEach(() => {
  store.clear();
});

test('初始状态：没有任何记录', () => {
  assert.deepEqual(getMyIds(), []);
});

test('addMyId 后能读回', () => {
  addMyId(7);
  assert.deepEqual(getMyIds(), [7]);
  assert.equal(isMine(7), true);
});

test('addMyId 重复调用不会产生重复项', () => {
  addMyId(7);
  addMyId(7);
  assert.deepEqual(getMyIds(), [7]);
});

test('addMyId 新记录排在最前（最新优先）', () => {
  addMyId(1);
  addMyId(2);
  addMyId(3);
  assert.deepEqual(getMyIds(), [3, 2, 1]);
});

test('removeMyId 只删指定项', () => {
  addMyId(1);
  addMyId(2);
  removeMyId(1);
  assert.deepEqual(getMyIds(), [2]);
});

test('removeMyId 不存在的 id 不报错', () => {
  addMyId(1);
  assert.doesNotThrow(() => removeMyId(999));
  assert.deepEqual(getMyIds(), [1]);
});

test('isMine 对未记录的 id 返回 false', () => {
  addMyId(1);
  assert.equal(isMine(2), false);
});

test('存储内容损坏时降级为空数组，不抛异常', () => {
  store.set(KEY, '{ this is not json');
  assert.deepEqual(getMyIds(), []);
});

test('存储内容不是数组时降级为空数组', () => {
  store.set(KEY, '{"a":1}');
  assert.deepEqual(getMyIds(), []);
});

test('过滤掉非整数的脏数据', () => {
  store.set(KEY, '[1, "x", 2.5, null, 3]');
  assert.deepEqual(getMyIds(), [1, 3]);
});

test('localStorage 不可写时静默失败，不抛异常', () => {
  const original = globalThis.window.localStorage;
  globalThis.window.localStorage = {
    getItem: original.getItem,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: original.removeItem,
  };
  try {
    assert.doesNotThrow(() => addMyId(5));
  } finally {
    globalThis.window.localStorage = original;
  }
});
