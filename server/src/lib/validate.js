/**
 * 输入校验（纯函数，无 I/O，可单测）。
 *
 * 设计原则：
 *   1. 服务端是唯一权威。前端做即时提示只是为了体验，最终以本文件结果为准。
 *   2. 逐字段返回中文错误（422 的 fields），前端可直接映射到表单项下方。
 *   3. 时间统一归一为 UTC ISO 字符串再入库，避免时区混杂导致排序错乱。
 */

export const ACTIVITY_TYPES = ['lecture', 'contest', 'recruit', 'club', 'other'];
export const PUBLISHER_TYPES = ['college', 'org', 'personal'];

export const ACTIVITY_TYPE_LABELS = {
  lecture: '讲座',
  contest: '竞赛',
  recruit: '招新',
  club: '社团活动',
  other: '其他',
};

export const PUBLISHER_TYPE_LABELS = {
  college: '学院',
  org: '学生组织',
  personal: '个人',
};

export const LIMITS = {
  title: 100,
  publisherName: 50,
  audience: 50,
  description: 5000,
  nickname: 20,
  content: 500,
};

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 把任意时间输入归一为 UTC ISO 字符串。
 * @returns {string|null} 非法返回 null
 */
export function normalizeDateTime(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const t = Date.parse(value.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * 必填文本字段。
 * @returns {{ok:true,value:string}|{ok:false,message:string}}
 */
function requiredText(input, key, label, max) {
  const raw = input[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, message: `「${label}」不能为空` };
  }
  const value = String(raw).trim();
  if (value.length > max) {
    return { ok: false, message: `「${label}」不能超过 ${max} 字` };
  }
  return { ok: true, value };
}

/** 可选题填 —— 空字符串视作未填 */
function optionalText(input, key, label, max) {
  const raw = input[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, value: null };
  }
  const value = String(raw).trim();
  if (value.length > max) {
    return { ok: false, message: `「${label}」不能超过 ${max} 字` };
  }
  return { ok: true, value };
}

/**
 * 校验并归一化活动输入。
 * @param {Record<string, unknown>} input
 * @returns {{ok:true,value:object}|{ok:false,fields:Record<string,string>}}
 */
export function validateActivityInput(input = {}) {
  /** @type {Record<string,string>} */
  const fields = {};
  const value = {};

  const title = requiredText(input, 'title', '活动名称', LIMITS.title);
  if (title.ok) value.title = title.value;
  else fields.title = title.message;

  const type = String(input.type ?? '').trim();
  if (!ACTIVITY_TYPES.includes(type)) {
    fields.type = '活动类型不合法';
  } else {
    value.type = type;
  }

  const publisherType = String(input.publisherType ?? '').trim();
  if (!PUBLISHER_TYPES.includes(publisherType)) {
    fields.publisherType = '发布者类型不合法（应为学院 / 学生组织 / 个人）';
  } else {
    value.publisherType = publisherType;
  }

  const publisherName = requiredText(input, 'publisherName', '发布者名称', LIMITS.publisherName);
  if (publisherName.ok) value.publisherName = publisherName.value;
  else fields.publisherName = publisherName.message;

  const audience = requiredText(input, 'audience', '面向对象', LIMITS.audience);
  if (audience.ok) value.audience = audience.value;
  else fields.audience = audience.message;

  const description = requiredText(input, 'description', '活动介绍', LIMITS.description);
  if (description.ok) value.description = description.value;
  else fields.description = description.message;

  // ---- 时间三件套：先各自合法，再校验相互大小关系 ----
  const startAt = normalizeDateTime(input.startAt);
  if (!startAt) fields.startAt = '请填写有效的开始时间';
  else value.startAt = startAt;

  const endAt = normalizeDateTime(input.endAt);
  if (!endAt) fields.endAt = '请填写有效的结束时间';
  else value.endAt = endAt;

  const signupDeadline = normalizeDateTime(input.signupDeadline);
  if (!signupDeadline) fields.signupDeadline = '请填写有效的报名截止时间';
  else value.signupDeadline = signupDeadline;

  // 只有三者都合法才比较，否则错误信息会互相干扰
  if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) {
    fields.endAt = '结束时间不能早于开始时间';
  }
  if (endAt && signupDeadline && Date.parse(signupDeadline) > Date.parse(endAt)) {
    fields.signupDeadline = '报名截止时间不能晚于活动结束时间';
  }

  // ---- 可选字段 ----
  const link = optionalText(input, 'link', '相关链接', 500);
  if (link.ok) {
    if (link.value !== null && !/^https?:\/\/\S+$/i.test(link.value)) {
      fields.link = '相关链接需以 http:// 或 https:// 开头';
    } else {
      value.link = link.value;
    }
  } else {
    fields.link = link.message;
  }

  const coverColor = optionalText(input, 'coverColor', '卡片配色', 7);
  if (coverColor.ok) {
    if (coverColor.value !== null && !COLOR_RE.test(coverColor.value)) {
      fields.coverColor = '卡片配色需为 #RRGGBB 格式';
    } else {
      value.coverColor = coverColor.value;
    }
  } else {
    fields.coverColor = coverColor.message;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}

/**
 * 校验评论输入。
 * @returns {{ok:true,value:{nickname:string,content:string}}|{ok:false,fields:Record<string,string>}}
 */
export function validateCommentInput(input = {}) {
  const fields = {};
  const value = {};

  // 昵称必填：任务书要求评论至少含昵称、内容、发表时间
  const nickname = requiredText(input, 'nickname', '昵称', LIMITS.nickname);
  if (nickname.ok) value.nickname = nickname.value;
  else fields.nickname = nickname.message;

  const content = requiredText(input, 'content', '评论内容', LIMITS.content);
  if (content.ok) value.content = content.value;
  else fields.content = content.message;

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}

/**
 * 校验查询参数（列表 / 时间轴共用），非法值降级为默认而非报错，
 * 避免用户手改 URL 导致整页 400。
 */
export function parseListQuery(query = {}) {
  const toInt = (v, def, min, max) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    if (Number.isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  };

  const oneOrMany = (v) => {
    if (v === undefined || v === null || v === '') return [];
    const arr = Array.isArray(v) ? v : String(v).split(',');
    return arr.map((s) => String(s).trim()).filter(Boolean);
  };

  const SORTS = {
    startAt: 'a.start_at',
    endAt: 'a.end_at',
    signupDeadline: 'a.signup_deadline',
    createdAt: 'a.created_at',
  };

  const sortKey = Object.hasOwn(SORTS, query.sort) ? query.sort : 'startAt';
  const order = String(query.order ?? '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return {
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
    types: oneOrMany(query.type).filter((t) => ACTIVITY_TYPES.includes(t)),
    publisherTypes: oneOrMany(query.publisherType).filter((t) => PUBLISHER_TYPES.includes(t)),
    audience: typeof query.audience === 'string' ? query.audience.trim() : '',
    status: ['signup_open', 'signup_closed', 'ongoing', 'ended'].includes(query.status)
      ? query.status
      : '',
    from: normalizeDateTime(query.from),
    to: normalizeDateTime(query.to),
    page: toInt(query.page, 1, 1, 1_000_000),
    pageSize: toInt(query.pageSize, 20, 1, 100),
    sortColumn: SORTS[sortKey],
    sortKey,
    order,
  };
}
