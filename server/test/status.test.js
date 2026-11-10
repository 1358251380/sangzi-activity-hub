/**
 * 状态派生纯函数测试。
 * 对应 docs/02 §3 状态派生规则、docs/03 E8 正交状态场景。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStatus,
  durationDays,
  isMultiDay,
  isSignupOpen,
  msUntilDeadline,
  statusClause,
} from '../src/lib/status.js';

const at = (s) => new Date(s);

const sample = {
  startAt: '2026-11-15T09:00:00.000Z',
  endAt: '2026-11-16T18:00:00.000Z',
  signupDeadline: '2026-10-20T23:59:00.000Z',
};

test('报名中：截止前且未开始', () => {
  assert.equal(deriveStatus(sample, at('2026-10-01T00:00:00Z')), 'signup_open');
});

test('报名已截止：过了截止但活动未开始', () => {
  assert.equal(deriveStatus(sample, at('2026-11-01T00:00:00Z')), 'signup_closed');
});

test('进行中：活动区间内', () => {
  assert.equal(deriveStatus(sample, at('2026-11-15T12:00:00Z')), 'ongoing');
});

test('已结束：活动结束后', () => {
  assert.equal(deriveStatus(sample, at('2026-12-01T00:00:00Z')), 'ended');
});

test('边界：恰好等于开始时间算进行中', () => {
  assert.equal(deriveStatus(sample, at('2026-11-15T09:00:00Z')), 'ongoing');
});

test('边界：恰好等于结束时间不算已结束', () => {
  assert.equal(deriveStatus(sample, at('2026-11-16T18:00:00Z')), 'ongoing');
});

test('E8 正交：活动进行中但报名仍开放', () => {
  const rolling = {
    startAt: '2026-11-05T14:00:00.000Z',
    endAt: '2026-11-30T18:00:00.000Z',
    signupDeadline: '2026-11-20T23:59:00.000Z',
  };
  const now = at('2026-11-10T00:00:00Z');
  assert.equal(deriveStatus(rolling, now), 'ongoing');
  assert.equal(isSignupOpen(rolling, now), true, '进行中但仍可报名');
});

test('isSignupOpen：过了截止点为 false', () => {
  assert.equal(isSignupOpen(sample, at('2026-10-21T00:00:00Z')), false);
  assert.equal(isSignupOpen(sample, at('2026-10-20T00:00:00Z')), true);
});

test('durationDays：单日活动算 1 天', () => {
  const oneDay = {
    startAt: '2026-11-12T01:00:00.000Z',
    endAt: '2026-11-12T03:00:00.000Z',
    signupDeadline: '2026-11-11T12:00:00.000Z',
  };
  assert.equal(durationDays(oneDay), 1);
});

test('durationDays：任务书样例跨 2 天', () => {
  assert.equal(durationDays(sample), 2);
});

test('isMultiDay：同日不算跨天，跨日算', () => {
  assert.equal(
    isMultiDay({
      startAt: '2026-11-12T01:00:00.000Z',
      endAt: '2026-11-12T03:00:00.000Z',
      signupDeadline: '2026-11-11T12:00:00.000Z',
    }),
    false,
  );
  assert.equal(isMultiDay(sample), true);
});

test('msUntilDeadline：已截止为负数', () => {
  assert.ok(msUntilDeadline(sample, at('2026-10-25T00:00:00Z')) < 0);
  assert.ok(msUntilDeadline(sample, at('2026-10-01T00:00:00Z')) > 0);
});

test('非法时间抛 TypeError', () => {
  assert.throws(
    () => deriveStatus({ startAt: 'x', endAt: 'y', signupDeadline: 'z' }),
    TypeError,
  );
});

test('statusClause：四种状态片段互斥且参数数量正确', () => {
  const nowIso = '2026-11-10T00:00:00.000Z';
  for (const status of ['signup_open', 'signup_closed', 'ongoing', 'ended']) {
    const { clause, params } = statusClause(status, nowIso);
    const holes = (clause.match(/\?/g) ?? []).length;
    assert.equal(holes, params.length, `${status} 占位符与参数数量不一致`);
    assert.ok(params.every((p) => p === nowIso));
  }
  assert.throws(() => statusClause('unknown', nowIso), TypeError);
});
