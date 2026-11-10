/**
 * 活动状态派生（纯函数，无 I/O，可单测）。
 *
 * 为什么状态不落库：
 *   状态完全由 startAt / endAt / signupDeadline 与"当前时间"决定。
 *   一旦落库，就会随时间推移与实际不一致，而时间轴、倒计时、筛选都依赖它。
 *
 * 为什么 status 与 signupOpen 正交：
 *   任务书要求"报名截止"和"举办活动"是两个不同的事。
 *   存在"活动已开始、但报名还没截止"的合法情况，单一枚举表达不了，
 *   因此拆成「生命周期 status」+「能否报名 signupOpen」两个维度。
 */

/** @typedef {'signup_open'|'signup_closed'|'ongoing'|'ended'} ActivityStatus */

export const STATUS_LABELS = {
  signup_open: '报名中',
  signup_closed: '报名已截止',
  ongoing: '进行中',
  ended: '已结束',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 派生活动生命周期状态。
 * @param {{startAt:string,endAt:string,signupDeadline:string}} activity
 * @param {Date} [now]
 * @returns {ActivityStatus}
 */
export function deriveStatus(activity, now = new Date()) {
  const t = now.getTime();
  const start = Date.parse(activity.startAt);
  const end = Date.parse(activity.endAt);
  const deadline = Date.parse(activity.signupDeadline);

  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(deadline)) {
    throw new TypeError('deriveStatus: 时间字段不是合法的 ISO 字符串');
  }

  if (t > end) return 'ended';
  if (t >= start) return 'ongoing';
  if (t >= deadline) return 'signup_closed';
  return 'signup_open';
}

/**
 * 是否仍可报名（与生命周期状态正交）。
 * @param {{signupDeadline:string}} activity
 * @param {Date} [now]
 */
export function isSignupOpen(activity, now = new Date()) {
  return now.getTime() < Date.parse(activity.signupDeadline);
}

/** 持续天数（向上取整，含首尾） */
export function durationDays(activity) {
  const start = Date.parse(activity.startAt);
  const end = Date.parse(activity.endAt);
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

/** 是否跨天 */
export function isMultiDay(activity) {
  const start = Date.parse(activity.startAt);
  const end = Date.parse(activity.endAt);
  // 以自然日为界：同一天 09:00-18:00 不算跨天
  return new Date(start).toDateString() !== new Date(end).toDateString();
}

/**
 * 距离报名截止的剩余毫秒数（已截止为负数）。
 */
export function msUntilDeadline(activity, now = new Date()) {
  return Date.parse(activity.signupDeadline) - now.getTime();
}

/**
 * 生成 status → SQL 条件片段。
 * Node 24 的 node:sqlite 无扩展，用 SQL 侧表达式保证筛选与分页同时正确
 * （若在 JS 侧过滤，会破坏 total / 分页）。
 * @param {ActivityStatus} status
 * @param {string} nowIso 当前时间的 UTC ISO 字符串
 * @returns {{ clause:string, params:unknown[] }}
 */
export function statusClause(status, nowIso) {
  switch (status) {
    case 'ended':
      return { clause: 'a.end_at < ?', params: [nowIso] };
    case 'ongoing':
      return { clause: 'a.start_at <= ? AND a.end_at >= ?', params: [nowIso, nowIso] };
    case 'signup_closed':
      return {
        clause: 'a.start_at > ? AND a.signup_deadline <= ?',
        params: [nowIso, nowIso],
      };
    case 'signup_open':
      return {
        clause: 'a.start_at > ? AND a.signup_deadline > ?',
        params: [nowIso, nowIso],
      };
    default:
      throw new TypeError(`statusClause: 未知状态 ${status}`);
  }
}
