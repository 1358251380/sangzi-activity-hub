/**
 * 时间轴坐标映射（纯函数，无 DOM、无依赖，可在 Node 中直接单测）。
 *
 * 核心思想（详见 docs/03-时间轴设计说明.md）：
 *   用一个连续时间坐标系同时表达两种时间语义 ——
 *     活动区间  → 色条的 left / width（区间）
 *     报名截止  → 独立标记点（时刻）
 *   因为两者共用同一个 ratio(t) 映射，所以永远对齐。
 *   连续坐标的好处：跨月、跨年自动正确，不需要按月切格。
 *
 * 分层：本文件只做「数据 → 几何」的投影，渲染交给 TimelineChart。
 *       这样所有边界情况都能离线验证。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- 日期辅助（本地时区，避免手写日期运算）----------

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 周一为一周起点
  return addDays(x, -dow);
}

function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfQuarter(d) {
  const s = startOfMonth(d);
  s.setMonth(Math.floor(s.getMonth() / 3) * 3);
  return s;
}

/** 支持的时间窗口模式 */
export const WINDOW_MODES = ['week', 'month', 'quarter'];

export const WINDOW_MODE_LABELS = {
  week: '周',
  month: '月',
  quarter: '季',
};

// ---------- 窗口 ----------

/**
 * 计算以 anchor 所在周期为基准的窗口。
 * @param {Date} anchor
 * @param {'week'|'month'|'quarter'} mode
 * @returns {{start:Date,end:Date,mode:string}}
 */
export function windowOf(anchor = new Date(), mode = 'month') {
  const a = new Date(anchor);
  switch (mode) {
    case 'week': {
      const s = startOfWeek(a);
      return { start: s, end: addDays(s, 7), mode };
    }
    case 'quarter': {
      const s = startOfQuarter(a);
      return { start: s, end: addMonths(s, 3), mode };
    }
    case 'month':
    default: {
      const s = startOfMonth(a);
      return { start: s, end: addMonths(s, 1), mode: 'month' };
    }
  }
}

/** 平移窗口（delta 以"一个周期"为单位） */
export function shiftWindow(win, delta = 1) {
  if (win.mode === 'week') {
    return { start: addDays(win.start, 7 * delta), end: addDays(win.end, 7 * delta), mode: 'week' };
  }
  if (win.mode === 'quarter') {
    return {
      start: addMonths(win.start, 3 * delta),
      end: addMonths(win.end, 3 * delta),
      mode: 'quarter',
    };
  }
  return {
    start: addMonths(win.start, delta),
    end: addMonths(win.end, delta),
    mode: 'month',
  };
}

/** 窗口标题：2026年11月 / 2026年Q4 / 11月10日 – 11月16日 */
export function windowLabel(win) {
  const s = win.start;
  const e = addDays(win.end, -1);
  if (win.mode === 'week') {
    const sameMonth = s.getMonth() === e.getMonth();
    return sameMonth
      ? `${s.getMonth() + 1}月${s.getDate()}日 – ${e.getDate()}日`
      : `${s.getMonth() + 1}月${s.getDate()}日 – ${e.getMonth() + 1}月${e.getDate()}日`;
  }
  if (win.mode === 'quarter') {
    return `${s.getFullYear()}年 Q${Math.floor(s.getMonth() / 3) + 1}`;
  }
  return `${s.getFullYear()}年${s.getMonth() + 1}月`;
}

/** 该窗口是否包含时间点 t */
export function windowContains(win, t) {
  const ms = t instanceof Date ? t.getTime() : Number(t);
  return ms >= win.start.getTime() && ms <= win.end.getTime();
}

// ---------- 刻度 ----------

/**
 * 生成时间刻度。粒度按窗口长度自适应，避免刻度过密或过疏。
 * @param {{start:Date,end:Date}} win
 * @returns {Array<{ratio:number,label:string,date:Date,isAnchor:boolean}>}
 */
export function buildTicks(win) {
  const W0 = win.start.getTime();
  const W1 = win.end.getTime();
  const span = Math.max(W1 - W0, 1);
  const days = span / DAY_MS;
  const ratio = (t) => ((t - W0) / span) * 100;

  const ticks = [];

  if (days <= 15) {
    // 按天
    for (let d = startOfDay(win.start); d.getTime() < W1; d = addDays(d, 1)) {
      ticks.push({
        ratio: ratio(d.getTime()),
        label: d.getDate() === 1 ? `${d.getMonth() + 1}月1日` : `${d.getMonth() + 1}/${d.getDate()}`,
        date: d,
        isAnchor: d.getDay() === 1, // 周一加粗
      });
    }
  } else if (days <= 75) {
    // 按周（周一）
    let d = startOfWeek(win.start);
    if (d.getTime() < W0) d = addDays(d, 7);
    for (; d.getTime() < W1; d = addDays(d, 7)) {
      ticks.push({
        ratio: ratio(d.getTime()),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        date: d,
        isAnchor: d.getDate() === 1,
      });
    }
  } else if (days <= 740) {
    // 按月
    for (let d = startOfMonth(win.start); d.getTime() < W1; d = addMonths(d, 1)) {
      if (d.getTime() < W0) continue;
      ticks.push({
        ratio: ratio(d.getTime()),
        label: d.getMonth() === 0 ? `${d.getFullYear()}年1月` : `${d.getMonth() + 1}月`,
        date: d,
        isAnchor: d.getMonth() === 0,
      });
    }
  } else {
    // 按年
    for (let d = new Date(win.start.getFullYear(), 0, 1); d.getTime() < W1; d = addMonths(d, 12)) {
      if (d.getTime() < W0) continue;
      ticks.push({
        ratio: ratio(d.getTime()),
        label: `${d.getFullYear()}年`,
        date: d,
        isAnchor: true,
      });
    }
  }

  return ticks;
}

// ---------- 主投影 ----------

/**
 * 把活动列表投影为时间轴行数据。
 *
 * @param {Array<object>} activities 活动 DTO（需含 startAt / endAt / signupDeadline）
 * @param {{start:Date,end:Date}} win 可视窗口
 * @param {Date} [now] 当前时间（用于"今天"基准线）
 * @returns {{rows:Array, ticks:Array, todayPct:number|null, empty:boolean, stats:object}}
 */
export function buildTimeline(activities = [], win, now = new Date()) {
  const W0 = win.start.getTime();
  const W1 = win.end.getTime();
  const span = Math.max(W1 - W0, 1);
  const ratio = (t) => ((t - W0) / span) * 100;
  const clampPct = (t) => Math.min(100, Math.max(0, ratio(t)));

  const rows = [];

  for (const a of activities) {
    const s = Date.parse(a.startAt);
    const e = Date.parse(a.endAt);
    const d = Date.parse(a.signupDeadline);
    if (Number.isNaN(s) || Number.isNaN(e)) continue;

    // 与窗口无交集则不出现
    if (s > W1 || e < W0) continue;

    const barStart = Math.max(s, W0);
    const barEnd = Math.min(e, W1);
    const leftPct = clampPct(barStart);
    const rightPct = clampPct(barEnd);
    const widthPct = Math.max(rightPct - leftPct, 0);

    rows.push({
      activity: a,
      leftPct,
      widthPct,
      // 端点被窗口裁剪时渲染成箭头，提示"此处还有内容"
      clippedStart: s < W0,
      clippedEnd: e > W1,
      isSingleDay: e - s < DAY_MS,
      durationDays: Math.max(1, Math.ceil((e - s) / DAY_MS)),
      // 报名截止：时刻，独立标记
      deadlinePct: Number.isNaN(d) ? null : clampPct(d),
      deadlineInWindow: !Number.isNaN(d) && d >= W0 && d <= W1,
      deadlinePassed: !Number.isNaN(d) && d < now.getTime(),
      deadlineOffscreenLeft: !Number.isNaN(d) && d < W0,
    });
  }

  // 按开始时间升序，同开始按持续时长降序（长活动在上，形成稳定视觉层级）
  rows.sort((x, y) => {
    const diff = Date.parse(x.activity.startAt) - Date.parse(y.activity.startAt);
    return diff !== 0 ? diff : y.durationDays - x.durationDays;
  });

  const nowMs = now.getTime();
  const stats = {
    total: rows.length,
    signupOpen: rows.filter((r) => r.activity.signupOpen).length,
    ongoing: rows.filter((r) => r.activity.status === 'ongoing').length,
    ended: rows.filter((r) => r.activity.status === 'ended').length,
    clipped: rows.filter((r) => r.clippedStart || r.clippedEnd).length,
  };

  return {
    rows,
    ticks: buildTicks(win),
    todayPct: nowMs >= W0 && nowMs <= W1 ? clampPct(nowMs) : null,
    empty: rows.length === 0,
    stats,
  };
}
