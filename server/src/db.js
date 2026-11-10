/**
 * 数据库连接与迁移。
 *
 * 设计要点：
 * - 使用 Node 内置 node:sqlite（DatabaseSync），零原生编译依赖。
 * - 迁移靠 PRAGMA user_version 递增，schema.sql 是唯一事实来源；当前版本 1。
 * - 测试通过传入 dbPath 使用独立临时库，不污染开发库。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const SCHEMA_FILE = resolve(__dirname, 'schema.sql');

/** 当前期望的数据库结构版本 */
export const SCHEMA_VERSION = 1;

/**
 * 解析数据库文件路径。
 * - 显式参数优先
 * - 其次环境变量 DB_PATH
 * - 最后默认 <项目根>/data/app.db
 * 相对路径按项目根目录解析（而非当前工作目录），保证任何位置启动结果一致。
 */
export function resolveDbPath(explicitPath) {
  const raw = explicitPath ?? process.env.DB_PATH ?? './data/app.db';
  if (raw === ':memory:') return raw;
  return isAbsolute(raw) ? raw : resolve(PROJECT_ROOT, raw);
}

/**
 * 打开数据库并完成迁移。
 * @param {string} [dbPath] 数据库文件路径，或 ':memory:'
 * @returns {DatabaseSync}
 */
export function openDatabase(dbPath) {
  const file = resolveDbPath(dbPath);
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/** 读取当前 schema 版本 */
export function getSchemaVersion(db) {
  const row = db.prepare('PRAGMA user_version').get();
  return Number(row?.user_version ?? 0);
}

/**
 * 顺序迁移。版本落后则整体事务执行 schema.sql。
 * schema.sql 全部使用 IF NOT EXISTS，重复执行是幂等的。
 */
function migrate(db) {
  const current = getSchemaVersion(db);
  if (current >= SCHEMA_VERSION) return;

  const sql = readFileSync(SCHEMA_FILE, 'utf8');
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw new Error(`数据库迁移失败（目标版本 ${SCHEMA_VERSION}）：${err.message}`, { cause: err });
  }
}

/** 关闭数据库（幂等） */
export function closeDatabase(db) {
  if (!db) return;
  try {
    db.close();
  } catch {
    /* 已关闭则忽略 */
  }
}
