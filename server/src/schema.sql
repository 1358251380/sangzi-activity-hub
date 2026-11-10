-- 校园活动聚合与时间轴系统 · 数据库结构
-- 单一事实来源：所有 DDL 变更都在本文件，由 db.js 按 user_version 顺序执行。
-- 设计说明见 docs/02-数据模型与接口设计.md

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  type            TEXT NOT NULL CHECK (type IN ('lecture','contest','recruit','club','other')),
  publisher_type  TEXT NOT NULL CHECK (publisher_type IN ('college','org','personal')),
  publisher_name  TEXT NOT NULL CHECK (length(publisher_name) BETWEEN 1 AND 50),
  audience        TEXT NOT NULL CHECK (length(audience) BETWEEN 1 AND 50),
  start_at        TEXT NOT NULL,
  end_at          TEXT NOT NULL,
  signup_deadline TEXT NOT NULL,
  description     TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  link            TEXT,
  cover_color     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (end_at >= start_at),
  CHECK (signup_deadline <= end_at)
);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  nickname    TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 20),
  content     TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_start    ON activities(start_at);
CREATE INDEX IF NOT EXISTS idx_activities_end      ON activities(end_at);
CREATE INDEX IF NOT EXISTS idx_activities_type     ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_pub      ON activities(publisher_type);
CREATE INDEX IF NOT EXISTS idx_activities_deadline ON activities(signup_deadline);
CREATE INDEX IF NOT EXISTS idx_activities_created  ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_activity   ON comments(activity_id, created_at DESC);
