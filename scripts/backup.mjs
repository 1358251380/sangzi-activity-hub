/**
 * SQLite 在线热备脚本。
 *
 * 为什么不能直接 copy 数据库文件：
 *   本项目开了 WAL 模式，最新的写入可能还在 -wal 文件里。
 *   裸拷 app.db 可能得到一个「缺最后若干次提交」甚至不一致的快照。
 *   正确做法是用 SQLite 的 VACUUM INTO：它在一个读事务里生成一致快照，
 *   且不需要停服务 —— 这就是「在线热备」。
 *
 * 用法：
 *   npm run backup
 *   DB_PATH=./data/app.db BACKUP_KEEP=7 npm run backup
 *
 * 输出：一份 JSON 摘要 + 一行人类可读结果；失败时退出码 1（便于接 CI / 定时任务）。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPathFrom } from '../server/src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const dbPath = resolveDbPathFrom(process.env.DB_PATH ?? './data/app.db', ROOT).value;
const backupDir = process.env.BACKUP_DIR
  ? resolve(process.env.BACKUP_DIR)
  : join(ROOT, 'data', 'backups');
const keep = Math.max(1, Number.parseInt(process.env.BACKUP_KEEP ?? '7', 10) || 7);

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }));
  process.exit(1);
}

if (!existsSync(dbPath)) {
  fail('数据库文件不存在，无法备份', { dbPath });
}

mkdirSync(backupDir, { recursive: true });

// 时间戳用固定宽度，保证按文件名排序 == 按时间排序（便于保留策略）
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+$/, '')
  .replace('T', '-');
const target = join(backupDir, `app-${stamp}.db`);

// ---- 1. 在线热备 ----
let snapshot;
try {
  const db = new DatabaseSync(dbPath);
  try {
    // 路径里的单引号需转义，避免拼出非法 SQL
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  snapshot = statSync(target);
} catch (err) {
  fail(`备份失败：${err.message}`, { dbPath, target });
}

// ---- 2. 校验备份可用（能打开 + 完整性检查 + 关键表行数）----
let integrity = null;
let activities = null;
let comments = null;
try {
  const v = new DatabaseSync(target);
  try {
    integrity = v.prepare('PRAGMA integrity_check').get()?.integrity_check ?? null;
    activities = Number(v.prepare('SELECT COUNT(*) AS n FROM activities').get()?.n ?? 0);
    comments = Number(v.prepare('SELECT COUNT(*) AS n FROM comments').get()?.n ?? 0);
  } finally {
    v.close();
  }
} catch (err) {
  fail(`备份文件无法打开或结构异常：${err.message}`, { target });
}

if (integrity !== 'ok') {
  fail('备份完整性检查未通过', { target, integrity });
}

// ---- 3. 保留策略：只留最近 keep 份 ----
let removed = [];
try {
  const files = readdirSync(backupDir)
    .filter((f) => /^app-\d{8}-\d{6}\.db$/.test(f))
    .sort(); // 文件名即时间序
  const excess = files.length - keep;
  if (excess > 0) {
    removed = files.slice(0, excess);
    for (const f of removed) unlinkSync(join(backupDir, f));
  }
} catch (err) {
  // 清理失败不应导致备份失败
  removed = [];
}

const result = {
  ok: true,
  dbPath,
  backup: target,
  sizeBytes: snapshot.size,
  integrity,
  activities,
  comments,
  keep,
  removed,
  at: new Date().toISOString(),
};
console.log(JSON.stringify(result, null, 2));
console.log(
  `备份成功：${target}（${(snapshot.size / 1024).toFixed(1)} KB，activities=${activities}，comments=${comments}，保留 ${keep} 份）`,
);
