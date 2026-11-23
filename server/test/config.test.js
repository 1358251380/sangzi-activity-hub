/**
 * 配置加载与校验测试（P0 ① 配置 fail-fast）。
 *
 * loadConfig 是纯函数：传入环境变量对象即得结果，不读全局 process.env，因此可直接单测。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sep } from 'node:path';
import {
  DEFAULTS,
  PROJECT_ROOT,
  formatConfigErrors,
  loadConfig,
  parseTrustProxy,
  resolveDbPathFrom,
} from '../src/config.js';

test('全部留空时使用默认值且校验通过', () => {
  const r = loadConfig({});
  assert.equal(r.ok, true);
  assert.equal(r.value.PORT, 3001);
  assert.equal(r.value.HOST, '0.0.0.0');
  assert.equal(r.value.NODE_ENV, 'development');
  assert.equal(r.value.IS_PRODUCTION, false);
  assert.equal(r.value.DB_PATH, resolveDbPathFrom(DEFAULTS.DB_PATH).value);
});

test('PORT 非数字被拒', () => {
  const r = loadConfig({ PORT: 'abc' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /PORT 必须是 1-65535/);
});

test('PORT 越界被拒', () => {
  assert.equal(loadConfig({ PORT: '0' }).ok, false);
  assert.equal(loadConfig({ PORT: '70000' }).ok, false);
  assert.equal(loadConfig({ PORT: '8080' }).ok, true);
});

test('PORT 带空格能容忍', () => {
  const r = loadConfig({ PORT: ' 3001 ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.PORT, 3001);
});

test('NODE_ENV 拼错被拒（典型事故：production 写成 prod）', () => {
  const r = loadConfig({ NODE_ENV: 'prod' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /NODE_ENV 必须是/);
});

test('NODE_ENV=production 时 IS_PRODUCTION 为真', () => {
  const r = loadConfig({ NODE_ENV: 'production' });
  assert.equal(r.ok, true);
  assert.equal(r.value.IS_PRODUCTION, true);
});

test('DB_PATH 相对路径按项目根解析', () => {
  const r = loadConfig({ DB_PATH: './data/app.db' });
  assert.equal(r.ok, true);
  assert.equal(r.value.DB_PATH, `${PROJECT_ROOT}${sep}data${sep}app.db`);
});

test('DB_PATH=:memory: 原样保留', () => {
  const r = loadConfig({ DB_PATH: ':memory:' });
  assert.equal(r.ok, true);
  assert.equal(r.value.DB_PATH, ':memory:');
});

test('DB_PATH 为空白被拒', () => {
  const r = loadConfig({ DB_PATH: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /DB_PATH 不能为空/);
});

test('LOG_FORMAT 默认：生产 json、开发 text', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production' }).value.LOG_FORMAT, 'json');
  assert.equal(loadConfig({ NODE_ENV: 'development' }).value.LOG_FORMAT, 'text');
});

test('LOG_FORMAT 非法值被拒', () => {
  const r = loadConfig({ LOG_FORMAT: 'xml' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /LOG_FORMAT 必须是/);
});

test('TRUST_PROXY 合法取值', () => {
  assert.equal(parseTrustProxy('true').value, true);
  assert.equal(parseTrustProxy('false').value, false);
  assert.equal(parseTrustProxy('2').value, 2);
  assert.equal(parseTrustProxy('loopback').value, 'loopback');
  assert.equal(parseTrustProxy('LoopBack').value, 'loopback');
});

test('TRUST_PROXY 非法取值被拒（避免透传给 Express 到运行时才炸）', () => {
  assert.equal(parseTrustProxy('abc').ok, false);
  assert.equal(parseTrustProxy('99').ok, false);
  assert.equal(parseTrustProxy('-1').ok, false);
});

test('CORS_ORIGIN 非 URL 被拒', () => {
  const r = loadConfig({ CORS_ORIGIN: 'localhost:5173' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /CORS_ORIGIN/);
});

test('CORS_ORIGIN 合法或留空均可', () => {
  assert.equal(loadConfig({ CORS_ORIGIN: 'http://localhost:5173' }).ok, true);
  assert.equal(loadConfig({ CORS_ORIGIN: '' }).ok, true);
});

test('多个错误一起返回，不是只报第一个', () => {
  const r = loadConfig({ PORT: 'x', NODE_ENV: 'y', LOG_FORMAT: 'z' });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
});

test('formatConfigErrors 输出可读文本', () => {
  const text = formatConfigErrors(['PORT 非法', 'NODE_ENV 非法']);
  assert.match(text, /配置校验失败/);
  assert.match(text, /- PORT 非法/);
  assert.match(text, /\.env\.example/);
});
