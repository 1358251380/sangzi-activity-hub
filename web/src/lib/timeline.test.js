/**
 * 时间轴坐标映射单测。对应 docs/03 §6 单测要点。
 * 纯函数，无需浏览器环境，`node --test src/lib/` 直接运行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTicks,
  buildTimeline,
  shiftWindow,
  windowLabel,
  windowOf,
} from './timeline.js';

const DAY = 24 * 60 * 60 * 1000;
const iso = (s) => new Date(s).toISOString();

/** 构造一个 2026-11-01 00:00 → 2026-12-01 00:00 的月窗口（本地时区） */
const novWindow = () => ({ start: new Date(2026, 10, 1), end: new Date(2026, 11, 1), mode: 'month' });

function act(over) {
  return {
    id: over.id ?? 1,
    title: over.title ?? '测试活动',
    startAt: over.startAt,
    endAt: over.endAt,
    signupDeadline: over.signupDeadline,
    status: over.status ?? 'signup_open',
    signupOpen: over.signupOpen ?? true,
  };
}

test('坐标线性性：窗口中点的活动 leftPct ≈ 50', () => {
  const win = novWindow();
  const mid = new Date(2026, 10, 16, 0, 0); // 11月16日 00:00 约在月末中点略前
  const a = act({
    startAt: mid.toISOString(),
    endAt: new Date(mid.getTime() + DAY).toISOString(),
    signupDeadline: new Date(mid.getTime() - DAY).toISOString(),
  });
  const { rows } = buildTimeline([a], win, new Date(2026, 10, 1));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].leftPct > 45 && rows[0].leftPct < 55, `实际 ${rows[0].leftPct}`);
});

test('E1 任务书样例：10/20 截止、11/15–16 举行，两者都能定位', () => {
  const win = novWindow();
  const a = act({
    startAt: iso('2026-11-15T09:00:00+08:00'),
    endAt: iso('2026-11-16T18:00:00+08:00'),
    signupDeadline: iso('2026-10-20T23:59:00+08:00'),
  });
  const { rows, ticks } = buildTimeline([a], win, new Date('2026-11-10T00:00:00+08:00'));
  const row = rows[0];

  // 色条：15日开始，跨度约 2 天
  assert.ok(row.widthPct > 0 && row.widthPct < 15, `宽度应约 2 天比例，实际 ${row.widthPct}`);
  // 截止点在窗口之前 → 左侧越界标记
  assert.equal(row.deadlineInWindow, false);
  assert.equal(row.deadlineOffscreenLeft, true, '报名截止应判定为窗口左侧外');
  // 刻度存在且对齐 0..100
  assert.ok(ticks.length > 0);
  assert.ok(ticks.every((t) => t.ratio >= 0 && t.ratio <= 100));
});

test('E2 单日活动宽度大于 0（CSS min-width 兜底前）', () => {
  const win = novWindow();
  const a = act({
    startAt: iso('2026-11-12T09:00:00+08:00'),
    endAt: iso('2026-11-12T11:00:00+08:00'),
    signupDeadline: iso('2026-11-11T20:00:00+08:00'),
  });
  const { rows } = buildTimeline([a], win);
  assert.equal(rows[0].isSingleDay, true);
  assert.ok(rows[0].widthPct > 0);
});

test('E4 跨月活动在连续坐标下不被月份边界打断', () => {
  const win = novWindow();
  const a = act({
    startAt: iso('2026-10-28T09:00:00+08:00'),
    endAt: iso('2026-11-03T17:00:00+08:00'),
    signupDeadline: iso('2026-10-27T23:59:00+08:00'),
  });
  const { rows } = buildTimeline([a], win);
  const row = rows[0];
  // 起点早于窗口 → left=0 且标记被裁剪；宽度 = 到 11/3 的比例
  assert.equal(row.leftPct, 0);
  assert.equal(row.clippedStart, true);
  assert.ok(row.widthPct > 0 && row.widthPct < 20);
});

test('E10 与窗口无交集的活动被过滤', () => {
  const win = novWindow();
  const a = act({
    startAt: iso('2027-03-01T08:00:00+08:00'),
    endAt: iso('2027-03-05T18:00:00+08:00'),
    signupDeadline: iso('2027-02-20T23:59:00+08:00'),
  });
  const { rows, empty } = buildTimeline([a], win);
  assert.equal(rows.length, 0);
  assert.equal(empty, true);
});

test('E11 部分落在窗口内：左端裁剪、右端不裁剪', () => {
  const win = novWindow();
  const a = act({
    startAt: iso('2026-10-15T19:00:00+08:00'),
    endAt: iso('2026-11-15T21:00:00+08:00'),
    signupDeadline: iso('2026-11-14T23:59:00+08:00'),
  });
  const { rows } = buildTimeline([a], win);
  assert.equal(rows[0].clippedStart, true);
  assert.equal(rows[0].clippedEnd, false);
  assert.equal(rows[0].leftPct, 0);
  assert.ok(rows[0].widthPct > 40 && rows[0].widthPct < 60);
});

test('E13 极窄窗口：长活动两端都被裁剪且铺满整行', () => {
  const win = { start: new Date(2026, 10, 10), end: new Date(2026, 10, 17), mode: 'week' };
  const a = act({
    startAt: iso('2026-11-01T00:00:00+08:00'),
    endAt: iso('2026-11-30T23:59:00+08:00'),
    signupDeadline: iso('2026-11-10T23:59:00+08:00'),
  });
  const { rows } = buildTimeline([a], win);
  assert.equal(rows[0].clippedStart, true);
  assert.equal(rows[0].clippedEnd, true);
  assert.equal(rows[0].leftPct, 0);
  assert.equal(rows[0].widthPct, 100);
});

test('windows 边界：完全覆盖窗口的活动宽度为 100%', () => {
  const win = novWindow();
  const a = act({
    startAt: iso('2026-10-01T00:00:00+08:00'),
    endAt: iso('2026-12-31T00:00:00+08:00'),
    signupDeadline: iso('2026-11-20T00:00:00+08:00'),
  });
  const { rows } = buildTimeline([a], win);
  assert.equal(rows[0].widthPct, 100);
});

test('除零保护：窗口起止相同不抛异常', () => {
  const win = { start: new Date(2026, 10, 1), end: new Date(2026, 10, 1), mode: 'month' };
  assert.doesNotThrow(() => buildTimeline([], win));
});

test('排序：按 startAt 升序，同开始按时长降序', () => {
  const win = novWindow();
  const long = act({
    id: 1,
    startAt: iso('2026-11-05T09:00:00+08:00'),
    endAt: iso('2026-11-20T18:00:00+08:00'),
    signupDeadline: iso('2026-11-01T00:00:00+08:00'),
  });
  const short = act({
    id: 2,
    startAt: iso('2026-11-05T09:00:00+08:00'),
    endAt: iso('2026-11-06T18:00:00+08:00'),
    signupDeadline: iso('2026-11-01T00:00:00+08:00'),
  });
  const later = act({
    id: 3,
    startAt: iso('2026-11-25T09:00:00+08:00'),
    endAt: iso('2026-11-26T18:00:00+08:00'),
    signupDeadline: iso('2026-11-20T00:00:00+08:00'),
  });
  const { rows } = buildTimeline([later, short, long], win);
  assert.deepEqual(rows.map((r) => r.activity.id), [1, 2, 3]);
});

test('今日基准线：窗口内非 null，窗口外为 null', () => {
  const win = novWindow();
  const inside = buildTimeline([], win, new Date(2026, 10, 15));
  assert.ok(inside.todayPct !== null && inside.todayPct > 0 && inside.todayPct < 100);

  const outside = buildTimeline([], win, new Date(2026, 11, 15));
  assert.equal(outside.todayPct, null);
});

test('统计：signupOpen / ongoing / ended 计数正确', () => {
  const win = novWindow();
  const list = [
    act({ id: 1, startAt: iso('2026-11-02T09:00:00+08:00'), endAt: iso('2026-11-02T10:00:00+08:00'), signupDeadline: iso('2026-11-01T00:00:00+08:00'), status: 'ended', signupOpen: false }),
    act({ id: 2, startAt: iso('2026-11-10T09:00:00+08:00'), endAt: iso('2026-11-20T10:00:00+08:00'), signupDeadline: iso('2026-11-25T00:00:00+08:00'), status: 'ongoing', signupOpen: true }),
    act({ id: 3, startAt: iso('2026-11-25T09:00:00+08:00'), endAt: iso('2026-11-26T10:00:00+08:00'), signupDeadline: iso('2026-11-24T00:00:00+08:00'), status: 'signup_open', signupOpen: true }),
  ];
  const { stats } = buildTimeline(list, win);
  assert.equal(stats.total, 3);
  assert.equal(stats.ended, 1);
  assert.equal(stats.ongoing, 1);
  assert.equal(stats.signupOpen, 2);
});

test('刻度自适应：周窗口按天、月窗口按周、年窗口按月', () => {
  const week = buildTicks(windowOf(new Date(2026, 10, 11), 'week'));
  assert.equal(week.length, 7, '周视图应有 7 个日刻度');

  const month = buildTicks(windowOf(new Date(2026, 10, 11), 'month'));
  assert.ok(month.length >= 4 && month.length <= 6, `月视图周刻度数量 ${month.length}`);

  const year = buildTicks({
    start: new Date(2026, 0, 1),
    end: new Date(2027, 0, 1),
    mode: 'month',
  });
  assert.ok(year.length >= 11 && year.length <= 13, `年跨度应出月刻度 ${year.length}`);
});

test('windowOf / shiftWindow / windowLabel 一致性', () => {
  const w = windowOf(new Date(2026, 10, 11), 'month');
  assert.equal(w.start.getMonth(), 10);
  assert.equal(w.end.getMonth(), 11);
  assert.equal(windowLabel(w), '2026年11月');

  const next = shiftWindow(w, 1);
  assert.equal(next.start.getMonth(), 11);
  assert.equal(windowLabel(next), '2026年12月');

  const prev = shiftWindow(w, -1);
  assert.equal(prev.start.getMonth(), 9);

  const q = windowOf(new Date(2026, 10, 11), 'quarter');
  assert.equal(q.start.getMonth(), 9, 'Q4 从 10 月开始');
  assert.equal(windowLabel(q), '2026年 Q4');

  const wk = windowOf(new Date(2026, 10, 11), 'week'); // 2026-11-11 是周三
  assert.equal(wk.start.getDay(), 1, '窗口从周一开始');
  assert.equal(wk.end.getTime() - wk.start.getTime(), 7 * DAY);
});
