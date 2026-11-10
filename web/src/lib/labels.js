/**
 * 枚举 → 中文标签与配色。
 * 服务端也有同一份（用于 422 文案与 /api/meta/options），
 * 这里保留一份"展示用"是为了首屏渲染不需要等接口返回。
 */

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

export const STATUS_LABELS = {
  signup_open: '报名中',
  signup_closed: '报名已截止',
  ongoing: '进行中',
  ended: '已结束',
};

/** 发布者类型 → CSS 变量名（卡片左侧色条） */
export const PUBLISHER_ACCENT = {
  college: 'var(--c-college)',
  org: 'var(--c-org)',
  personal: 'var(--c-personal)',
};

/** 状态 → 时间轴色条颜色（与徽标语义一致） */
export const STATUS_BAR_COLORS = {
  signup_open: '#059669',
  signup_closed: '#64748b',
  ongoing: '#2563eb',
  ended: '#cbd5e1',
};

export const publisherLabel = (v) => PUBLISHER_TYPE_LABELS[v] ?? v;
export const typeLabel = (v) => ACTIVITY_TYPE_LABELS[v] ?? v;
export const statusLabel = (v) => STATUS_LABELS[v] ?? v;
