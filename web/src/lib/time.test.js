/**
 * 时间工具测试。
 *
 * 全部用本地 Date 构造输入，不依赖固定时区，因此在任何时区跑结果一致。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPLAY_FORMAT,
  deadlineText,
  durationText,
  fmtDate,
  fmtDateTime,
  fmtRange,
  fmtShort,
  fromLocalInputValue,
  isDeadlineUrgent,
  toLocalInputValue,
} from './time.js';

/** 本地时间构造器：d(2026,11,15,9,30) = 2026-11-15 09:30（本机时区） */
const d = (y, m, day, h = 0, mi = 0) => new Date(y, m - 1, day, h, mi, 0, 0);

test('DISPLAY_FORMAT 常量正确', () => {
  assert.equal(DISPLAY_FORMAT, 'YYYY-MM-DD HH:mm');
});

test('fmtDateTime 输出完整日期时间', () => {
  assert.equal(fmtDateTime(d(2026, 11, 15, 9, 30)), '2026-11-15 09:30');
});

test('fmtDateTime 空值回退为破折号', () => {
  assert.equal(fmtDateTime(''), '—');
  assert.equal(fmtDateTime(null), '—');
  assert.equal(fmtDateTime(undefined), '—');
});

test('fmtDate 只输出日期', () => {
  assert.equal(fmtDate(d(2026, 11, 15, 9, 30)), '2026-11-15');
});

test('fmtShort 输出月-日', () => {
  assert.equal(fmtShort(d(2026, 11, 15, 9)), '11-15');
});

test('fmtRange 同日：结束时间只显示时分', () => {
  const text = fmtRange(d(2026, 11, 15, 9, 0), d(2026, 11, 15, 18, 0));
  assert.equal(text, '2026-11-15 09:00 – 18:00');
});

test('fmtRange 跨日：两端都显示完整日期时间', () => {
  const text = fmtRange(d(2026, 11, 15, 9, 0), d(2026, 11, 16, 18, 0));
  assert.equal(text, '2026-11-15 09:00 – 2026-11-16 18:00');
});

test('durationText：不足一小时按分钟', () => {
  assert.equal(durationText(d(2026, 11, 15, 9, 0), d(2026, 11, 15, 9, 30)), '30 分钟');
});

test('durationText：同日数小时按小时', () => {
  assert.equal(durationText(d(2026, 11, 15, 9, 0), d(2026, 11, 15, 18, 0)), '9 小时');
});

test('durationText：跨 33 小时应为 2 天（不是 1 天）', () => {
  // 这正是修过的 bug：Math.round(1.375) = 1，会让跨日活动显示成 1 天
  const text = durationText(d(2026, 11, 15, 9, 0), d(2026, 11, 16, 18, 0));
  assert.equal(text, '2 天');
});

test('durationText：跨月向上取整，与时间轴 durationDays 口径一致', () => {
  assert.equal(durationText(d(2026, 10, 15, 19, 0), d(2026, 11, 15, 21, 0)), '32 天');
  assert.equal(durationText(d(2026, 10, 28, 9, 0), d(2026, 11, 3, 17, 0)), '7 天');
});

test('durationText：跨年活动', () => {
  assert.equal(durationText(d(2026, 12, 30, 9, 0), d(2027, 1, 2, 17, 0)), '4 天');
});

test('deadlineText：已过期返回"已截止"', () => {
  assert.equal(deadlineText(d(2026, 10, 20, 23, 59), d(2026, 10, 25, 0, 0)), '已截止');
});

test('deadlineText：恰好到期算已截止', () => {
  const t = d(2026, 10, 20, 23, 59);
  assert.equal(deadlineText(t, t), '已截止');
});

test('deadlineText：不足 1 小时', () => {
  assert.equal(deadlineText(d(2026, 10, 20, 12, 30), d(2026, 10, 20, 12, 0)), '不足 1 小时');
});

test('deadlineText：按小时显示', () => {
  assert.equal(deadlineText(d(2026, 10, 20, 15, 0), d(2026, 10, 20, 9, 0)), '还剩 6 小时');
});

test('deadlineText：按天显示', () => {
  assert.equal(deadlineText(d(2026, 10, 24, 9, 0), d(2026, 10, 20, 9, 0)), '还剩 4 天');
});

test('isDeadlineUrgent：3 天内为紧迫', () => {
  const deadline = d(2026, 10, 22, 12, 0);
  assert.equal(isDeadlineUrgent(deadline, d(2026, 10, 20, 12, 0)), true);
});

test('isDeadlineUrgent：超过 3 天不紧迫', () => {
  const deadline = d(2026, 10, 25, 12, 0);
  assert.equal(isDeadlineUrgent(deadline, d(2026, 10, 20, 12, 0)), false);
});

test('isDeadlineUrgent：已过期不算紧迫（避免红色高亮误导）', () => {
  const deadline = d(2026, 10, 18, 12, 0);
  assert.equal(isDeadlineUrgent(deadline, d(2026, 10, 20, 12, 0)), false);
});

test('toLocalInputValue 生成 datetime-local 可用的值', () => {
  assert.equal(toLocalInputValue(d(2026, 11, 15, 9, 5)), '2026-11-15T09:05');
  assert.equal(toLocalInputValue(''), '');
});

test('fromLocalInputValue 与 toLocalInputValue 互为逆运算', () => {
  const original = d(2026, 11, 15, 9, 5);
  const inputValue = toLocalInputValue(original);
  const back = new Date(fromLocalInputValue(inputValue));
  assert.equal(back.getTime(), original.getTime());
});

test('fromLocalInputValue 空值返回空字符串', () => {
  assert.equal(fromLocalInputValue(''), '');
});
