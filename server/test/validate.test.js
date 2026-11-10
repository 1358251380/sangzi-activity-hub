/**
 * 校验纯函数测试。
 * 对应 docs/01 §2 F4 校验规则表。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDateTime,
  parseListQuery,
  validateActivityInput,
  validateCommentInput,
} from '../src/lib/validate.js';

const validInput = () => ({
  title: '第七届程序设计竞赛',
  type: 'contest',
  publisherType: 'college',
  publisherName: '计算机学院',
  audience: '全校',
  startAt: '2026-11-15T09:00:00+08:00',
  endAt: '2026-11-16T18:00:00+08:00',
  signupDeadline: '2026-10-20T23:59:00+08:00',
  description: '面向全校本科生的个人赛。',
});

test('合法输入通过并归一化为 UTC ISO', () => {
  const r = validateActivityInput(validInput());
  assert.equal(r.ok, true);
  assert.equal(r.value.startAt, '2026-11-15T01:00:00.000Z');
  assert.equal(r.value.endAt, '2026-11-16T10:00:00.000Z');
  assert.equal(r.value.signupDeadline, '2026-10-20T15:59:00.000Z');
});

test('必填项为空时逐字段报错', () => {
  const r = validateActivityInput({});
  assert.equal(r.ok, false);
  for (const key of [
    'title',
    'type',
    'publisherType',
    'publisherName',
    'audience',
    'description',
    'startAt',
    'endAt',
    'signupDeadline',
  ]) {
    assert.ok(r.fields[key], `缺少 ${key} 的错误`);
  }
});

test('纯空白视为空', () => {
  const r = validateActivityInput({ ...validInput(), title: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.fields.title, /不能为空/);
});

test('结束时间早于开始时间被拒', () => {
  const r = validateActivityInput({
    ...validInput(),
    startAt: '2026-11-16T09:00:00+08:00',
    endAt: '2026-11-15T09:00:00+08:00',
    signupDeadline: '2026-11-10T09:00:00+08:00',
  });
  assert.equal(r.ok, false);
  assert.equal(r.fields.endAt, '结束时间不能早于开始时间');
});

test('报名截止晚于活动结束被拒', () => {
  const r = validateActivityInput({
    ...validInput(),
    signupDeadline: '2026-11-20T09:00:00+08:00',
  });
  assert.equal(r.ok, false);
  assert.equal(r.fields.signupDeadline, '报名截止时间不能晚于活动结束时间');
});

test('报名截止等于活动结束是允许的', () => {
  const r = validateActivityInput({
    ...validInput(),
    signupDeadline: '2026-11-16T18:00:00+08:00',
  });
  assert.equal(r.ok, true);
});

test('活动类型不在枚举内被拒', () => {
  const r = validateActivityInput({ ...validInput(), type: 'banquet' });
  assert.equal(r.ok, false);
  assert.ok(r.fields.type);
});

test('发布者类型不在枚举内被拒', () => {
  const r = validateActivityInput({ ...validInput(), publisherType: 'admin' });
  assert.equal(r.ok, false);
  assert.ok(r.fields.publisherType);
});

test('标题超长被拒', () => {
  const r = validateActivityInput({ ...validInput(), title: '标'.repeat(101) });
  assert.equal(r.ok, false);
  assert.match(r.fields.title, /不能超过 100 字/);
});

test('介绍超长被拒', () => {
  const r = validateActivityInput({ ...validInput(), description: '文'.repeat(5001) });
  assert.equal(r.ok, false);
  assert.match(r.fields.description, /不能超过 5000 字/);
});

test('链接必须是 http/https', () => {
  const bad = validateActivityInput({ ...validInput(), link: 'javascript:alert(1)' });
  assert.equal(bad.ok, false);
  assert.ok(bad.fields.link);

  const good = validateActivityInput({ ...validInput(), link: 'https://example.com/a' });
  assert.equal(good.ok, true);
  assert.equal(good.value.link, 'https://example.com/a');

  const empty = validateActivityInput({ ...validInput(), link: '' });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.link, null);
});

test('卡片配色需为 #RRGGBB', () => {
  assert.equal(validateActivityInput({ ...validInput(), coverColor: '#2563EB' }).ok, true);
  assert.equal(validateActivityInput({ ...validInput(), coverColor: 'blue' }).ok, false);
});

test('评论内容为空被拒', () => {
  const r = validateCommentInput({ nickname: '小林', content: '  ' });
  assert.equal(r.ok, false);
  assert.match(r.fields.content, /不能为空/);
});

test('评论昵称为空被拒', () => {
  const r = validateCommentInput({ nickname: '', content: '有内容' });
  assert.equal(r.ok, false);
  assert.match(r.fields.nickname, /不能为空/);
});

test('评论超长被拒', () => {
  const r = validateCommentInput({ nickname: '小林', content: '字'.repeat(501) });
  assert.equal(r.ok, false);
  assert.match(r.fields.content, /不能超过 500 字/);
});

test('合法评论通过并去除首尾空白', () => {
  const r = validateCommentInput({ nickname: ' 小林 ', content: ' 报名要交材料 ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.nickname, '小林');
  assert.equal(r.value.content, '报名要交材料');
});

test('normalizeDateTime：非法返回 null', () => {
  assert.equal(normalizeDateTime(''), null);
  assert.equal(normalizeDateTime('not-a-date'), null);
  assert.equal(normalizeDateTime('2026-11-15T09:00:00+08:00'), '2026-11-15T01:00:00.000Z');
});

test('parseListQuery：非法值降级为默认而非报错', () => {
  const q = parseListQuery({ page: 'abc', pageSize: '9999', type: 'contest,banquet', sort: 'evil' });
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 100, 'pageSize 被夹到上限');
  assert.deepEqual(q.types, ['contest'], '非法类型被过滤');
  assert.equal(q.sortColumn, 'a.start_at', '非法排序回退默认');
  assert.equal(q.order, 'ASC');
});

test('parseListQuery：支持逗号分隔与数组两种多值形式', () => {
  assert.deepEqual(parseListQuery({ type: 'lecture,contest' }).types, ['lecture', 'contest']);
  assert.deepEqual(parseListQuery({ type: ['lecture', 'club'] }).types, ['lecture', 'club']);
});

test('parseListQuery：排序字段白名单，不允许注入', () => {
  const q = parseListQuery({ sort: 'start_at; DROP TABLE activities' });
  assert.equal(q.sortColumn, 'a.start_at');
});
