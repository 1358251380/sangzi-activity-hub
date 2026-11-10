/**
 * 时间工具：所有时间展示与表单转换集中在这里。
 * 存储统一 UTC ISO，展示统一北京时间（本地时区）。
 */
import dayjs from 'dayjs';

export const DISPLAY_FORMAT = 'YYYY-MM-DD HH:mm';

/** 完整日期时间：2026-11-15 09:00 */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  return dayjs(iso).format(DISPLAY_FORMAT);
}

/** 仅日期：2026-11-15 */
export function fmtDate(iso) {
  if (!iso) return '—';
  return dayjs(iso).format('YYYY-MM-DD');
}

/** 短日期：11-15 */
export function fmtShort(iso) {
  if (!iso) return '—';
  return dayjs(iso).format('MM-DD');
}

/**
 * 活动时长区间文本。同一天只显示一次日期，跨天完整显示两端。
 */
export function fmtRange(startIso, endIso) {
  const s = dayjs(startIso);
  const e = dayjs(endIso);
  if (s.isSame(e, 'day')) {
    return `${s.format('YYYY-MM-DD HH:mm')} – ${e.format('HH:mm')}`;
  }
  return `${s.format(DISPLAY_FORMAT)} – ${e.format(DISPLAY_FORMAT)}`;
}

/** 持续时长描述：3 小时 / 2 天 / 1 个月 */
export function durationText(startIso, endIso) {
  const diffMin = dayjs(endIso).diff(dayjs(startIso), 'minute');
  if (diffMin < 60) return `${Math.max(1, diffMin)} 分钟`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时`;
  // 用向上取整而非四舍五入：跨日即算 2 天。
  // 33 小时（如 11-15 09:00 → 11-16 18:00）四舍五入会得到"1 天"，与时间轴上的跨度矛盾。
  const diffDay = Math.ceil(diffMin / (60 * 24));
  return `${Math.max(1, diffDay)} 天`;
}

/**
 * 报名截止的相对描述。
 * 已截止 → "已截止"；未来 → "还剩 N 天 / N 小时"。
 */
export function deadlineText(deadlineIso, now = new Date()) {
  const diffMs = dayjs(deadlineIso).valueOf() - now.getTime();
  if (diffMs <= 0) return '已截止';
  const diffHour = diffMs / 36e5;
  if (diffHour < 1) return '不足 1 小时';
  if (diffHour < 24) return `还剩 ${Math.floor(diffHour)} 小时`;
  const diffDay = Math.floor(diffHour / 24);
  return `还剩 ${diffDay} 天`;
}

/** 截止是否紧迫（用于高亮） */
export function isDeadlineUrgent(deadlineIso, now = new Date()) {
  const diffMs = dayjs(deadlineIso).valueOf() - now.getTime();
  return diffMs > 0 && diffMs < 3 * 24 * 36e5;
}

/** ISO → <input type="datetime-local"> 的值（本地时区） */
export function toLocalInputValue(iso) {
  if (!iso) return '';
  return dayjs(iso).format('YYYY-MM-DDTHH:mm');
}

/** <input type="datetime-local"> 的值 → ISO（UTC） */
export function fromLocalInputValue(value) {
  if (!value) return '';
  return new Date(value).toISOString();
}

/** 当前时间可用作基准（便于测试注入） */
export const now = () => new Date();
