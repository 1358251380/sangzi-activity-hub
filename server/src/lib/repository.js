/**
 * 数据访问层：所有 SQL 集中在此，路由只做参数解析与响应包装。
 *
 * 约定：
 * - 对外字段一律 camelCase（DTO），数据库字段 snake_case，转换只在 toActivityDTO 一处发生。
 * - 所有 SQL 使用参数化语句，禁止字符串拼接用户输入。
 * - status / signupOpen 不读库，由 lib/status.js 派生。
 */
import { deriveStatus, isSignupOpen, statusClause } from './status.js';

/** LIKE 通配符转义，配合 ESCAPE '\' 使用 */
function escapeLike(input) {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** 数据库行 → 对外 DTO，并附加派生字段 */
export function toActivityDTO(row, now = new Date()) {
  const dto = {
    id: row.id,
    title: row.title,
    type: row.type,
    publisherType: row.publisher_type,
    publisherName: row.publisher_name,
    audience: row.audience,
    startAt: row.start_at,
    endAt: row.end_at,
    signupDeadline: row.signup_deadline,
    description: row.description,
    link: row.link ?? null,
    coverColor: row.cover_color ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: Number(row.comment_count ?? 0),
  };
  dto.status = deriveStatus(dto, now);
  dto.signupOpen = isSignupOpen(dto, now);
  return dto;
}

/** 数据库行 → 评论 DTO */
export function toCommentDTO(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    nickname: row.nickname,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * 组装 WHERE 子句（列表与时间轴共用）。
 * @returns {{sql:string, params:unknown[]}}
 */
function buildFilters(options, nowIso) {
  const clauses = [];
  const params = [];

  if (options.q) {
    const like = `%${escapeLike(options.q)}%`;
    clauses.push(`(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }
  if (options.types?.length) {
    clauses.push(`a.type IN (${options.types.map(() => '?').join(',')})`);
    params.push(...options.types);
  }
  if (options.publisherTypes?.length) {
    clauses.push(`a.publisher_type IN (${options.publisherTypes.map(() => '?').join(',')})`);
    params.push(...options.publisherTypes);
  }
  if (options.audience) {
    clauses.push('a.audience = ?');
    params.push(options.audience);
  }
  if (options.status) {
    const { clause, params: extra } = statusClause(options.status, nowIso);
    clauses.push(clause);
    params.push(...extra);
  }
  // 时间范围：与活动区间有交集
  if (options.from) {
    clauses.push('a.end_at >= ?');
    params.push(options.from);
  }
  if (options.to) {
    clauses.push('a.start_at <= ?');
    params.push(options.to);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

/**
 * 分页查询活动列表。
 * @returns {{items:object[], total:number, page:number, pageSize:number, totalPages:number}}
 */
export function listActivities(db, options, now = new Date()) {
  const nowIso = now.toISOString();
  const { sql: whereSql, params: whereParams } = buildFilters(options, nowIso);

  const total = Number(
    db
      .prepare(`SELECT COUNT(*) AS total FROM activities a ${whereSql}`)
      .get(...whereParams)?.total ?? 0,
  );

  const offset = (options.page - 1) * options.pageSize;
  // 次级排序用 id 保证分页稳定（同时间活动不会跨页跳动）
  const rows = db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM comments c WHERE c.activity_id = a.id) AS comment_count
         FROM activities a
         ${whereSql}
        ORDER BY ${options.sortColumn} ${options.order}, a.id ASC
        LIMIT ? OFFSET ?`,
    )
    .all(...whereParams, options.pageSize, offset);

  return {
    items: rows.map((r) => toActivityDTO(r, now)),
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
  };
}

/** 时间轴专用：不分页，按开始时间升序 */
export function listForTimeline(db, options, now = new Date()) {
  const nowIso = now.toISOString();
  const { sql: whereSql, params } = buildFilters(options, nowIso);
  const rows = db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM comments c WHERE c.activity_id = a.id) AS comment_count
         FROM activities a
         ${whereSql}
        ORDER BY a.start_at ASC, a.id ASC`,
    )
    .all(...params);
  return rows.map((r) => toActivityDTO(r, now));
}

/** 按 id 查单个活动，不存在返回 null */
export function getActivityById(db, id, now = new Date()) {
  const row = db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM comments c WHERE c.activity_id = a.id) AS comment_count
         FROM activities a WHERE a.id = ?`,
    )
    .get(id);
  return row ? toActivityDTO(row, now) : null;
}

/** 新增活动，返回新记录 DTO */
export function createActivity(db, value, now = new Date()) {
  const ts = now.toISOString();
  const info = db
    .prepare(
      `INSERT INTO activities
         (title, type, publisher_type, publisher_name, audience,
          start_at, end_at, signup_deadline, description, link, cover_color,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      value.title,
      value.type,
      value.publisherType,
      value.publisherName,
      value.audience,
      value.startAt,
      value.endAt,
      value.signupDeadline,
      value.description,
      value.link ?? null,
      value.coverColor ?? null,
      ts,
      ts,
    );
  return getActivityById(db, Number(info.lastInsertRowid), now);
}

/** 全量更新（PATCH 由路由层先合并再调用） */
export function updateActivity(db, id, value, now = new Date()) {
  const info = db
    .prepare(
      `UPDATE activities
          SET title = ?, type = ?, publisher_type = ?, publisher_name = ?, audience = ?,
              start_at = ?, end_at = ?, signup_deadline = ?, description = ?,
              link = ?, cover_color = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(
      value.title,
      value.type,
      value.publisherType,
      value.publisherName,
      value.audience,
      value.startAt,
      value.endAt,
      value.signupDeadline,
      value.description,
      value.link ?? null,
      value.coverColor ?? null,
      now.toISOString(),
      id,
    );
  return info.changes > 0 ? getActivityById(db, id, now) : null;
}

/** 删除活动（评论由外键 ON DELETE CASCADE 级联删除） */
export function deleteActivity(db, id) {
  return db.prepare('DELETE FROM activities WHERE id = ?').run(id).changes > 0;
}

/** 评论列表：新的在前 */
export function listComments(db, activityId) {
  return db
    .prepare('SELECT * FROM comments WHERE activity_id = ? ORDER BY created_at DESC, id DESC')
    .all(activityId)
    .map(toCommentDTO);
}

/** 新增评论 */
export function createComment(db, activityId, value, now = new Date()) {
  const info = db
    .prepare(
      'INSERT INTO comments (activity_id, nickname, content, created_at) VALUES (?,?,?,?)',
    )
    .run(activityId, value.nickname, value.content, now.toISOString());
  const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(info.lastInsertRowid));
  return toCommentDTO(row);
}

/** 数据库是否可用（健康检查用） */
export function pingDatabase(db) {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return true;
  } catch {
    return false;
  }
}
