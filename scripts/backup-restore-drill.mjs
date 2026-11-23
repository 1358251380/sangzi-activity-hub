/**
 * 备份恢复演练（自动化、可重复执行）。
 *
 * 为什么要有这个脚本：
 *   「有备份」和「备份能恢复」是两件事。演练必须真的把数据删掉再还原，
 *   否则你不知道备份文件是否可用、恢复步骤是否写对。
 *
 * 安全性：全程在系统临时目录里造数据，**不碰真实数据库**。
 *
 * 用法：
 *   npm run backup:drill
 * 退出码 0 = 演练通过；1 = 失败（会打印失败步骤）。
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, openDatabase } from '../server/src/db.js';
import { seed } from '../server/src/seed.js';

const steps = [];
function step(name, fn) {
  try {
    const detail = fn();
    steps.push({ step: name, ok: true, detail });
    console.log(`✔ ${name}${detail ? ` —— ${detail}` : ''}`);
    return true;
  } catch (err) {
    steps.push({ step: name, ok: false, error: err.message });
    console.error(`✖ ${name} —— ${err.message}`);
    return false;
  }
}

/** 读取关键表行数（单开一个连接，读完即关） */
function readCounts(path) {
  const db = new DatabaseSync(path);
  try {
    const a = Number(db.prepare('SELECT COUNT(*) AS n FROM activities').get()?.n ?? 0);
    const c = Number(db.prepare('SELECT COUNT(*) AS n FROM comments').get()?.n ?? 0);
    return { activities: a, comments: c };
  } finally {
    db.close();
  }
}

const work = mkdtempSync(join(tmpdir(), 'sangzi-drill-'));
const dbPath = join(work, 'app.db');
const backupPath = join(work, 'backup.db');

let before = null;

step('1. 在临时目录创建数据库并写入示例数据', () => {
  const db = openDatabase(dbPath);
  try {
    seed(db, { reset: true });
  } finally {
    closeDatabase(db);
  }
  before = readCounts(dbPath);
  return `activities=${before.activities}, comments=${before.comments}`;
});

step('2. 在线热备（VACUUM INTO）', () => {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  if (!existsSync(backupPath)) throw new Error('备份文件未生成');
  return backupPath;
});

step('3. 备份文件自检（完整性 + 行数一致）', () => {
  const db = new DatabaseSync(backupPath);
  let integrity;
  try {
    integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  } finally {
    db.close();
  }
  if (integrity !== 'ok') throw new Error(`integrity_check = ${integrity}`);
  const got = readCounts(backupPath);
  if (got.activities !== before.activities || got.comments !== before.comments) {
    throw new Error(`行数不一致：备份 ${JSON.stringify(got)} vs 原始 ${JSON.stringify(before)}`);
  }
  return `integrity=ok, activities=${got.activities}`;
});

step('4. 模拟灾难：删除数据库（含 -wal / -shm）', () => {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(dbPath)) throw new Error('删除失败');
  return '库文件已删除';
});

step('5. 从备份恢复', () => {
  copyFileSync(backupPath, dbPath);
  if (!existsSync(dbPath)) throw new Error('恢复后文件不存在');
  return '已还原';
});

step('6. 恢复后校验（能打开 + 完整性 + 行数一致）', () => {
  const db = new DatabaseSync(dbPath);
  let integrity;
  try {
    integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  } finally {
    db.close();
  }
  if (integrity !== 'ok') throw new Error(`integrity_check = ${integrity}`);
  const after = readCounts(dbPath);
  if (after.activities !== before.activities || after.comments !== before.comments) {
    throw new Error(`恢复后行数不一致：${JSON.stringify(after)} vs ${JSON.stringify(before)}`);
  }
  return `恢复后 activities=${after.activities}, comments=${after.comments}，与备份前一致`;
});

step('7. 恢复后的库能被应用正常打开（走 openDatabase 迁移路径）', () => {
  const db = openDatabase(dbPath);
  try {
    const n = Number(db.prepare('SELECT COUNT(*) AS n FROM activities').get()?.n ?? 0);
    if (n !== before.activities) throw new Error(`应用视角行数异常：${n}`);
    return 'ok';
  } finally {
    closeDatabase(db);
  }
});

// 清理临时目录（演练数据不留痕）
try {
  rmSync(work, { recursive: true, force: true });
} catch {
  /* 清理失败不影响结论 */
}

const failed = steps.filter((s) => !s.ok);
const summary = {
  ok: failed.length === 0,
  totalSteps: steps.length,
  failed: failed.map((s) => s.step),
};
console.log('');
console.log(JSON.stringify(summary));

if (summary.ok) {
  console.log(`\n恢复演练通过（${steps.length}/${steps.length} 步）`);
  process.exit(0);
}
console.error(`\n恢复演练失败（${failed.length} 步未通过）`);
process.exit(1);
