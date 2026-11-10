import { useNavigate } from 'react-router-dom';
import { STATUS_BAR_COLORS, statusLabel, typeLabel } from '../lib/labels.js';
import { fmtDate, fmtShort } from '../lib/time.js';

/**
 * 色条宽度（百分比）低于该阈值时不把标题塞进色条内部 ——
 * 否则 2 天以内的短活动会把标题压成"第七届""月"这类碎片。
 * 改为把标题画在色条外侧，每行只有一个活动，因此不会互相遮挡。
 */
const INSIDE_LABEL_MIN_WIDTH = 18;
/** 右侧剩余空间不足时，把标题换到色条左侧，避免溢出画布 */
const LABEL_RIGHT_MIN_ROOM = 24;

/**
 * 横向甘特式时间轴。
 *
 * 所有几何量（leftPct / widthPct / deadlinePct / todayPct）都由
 * lib/timeline.js 的纯函数算好，本组件只负责把它们画出来。
 * 这样边界情况（裁剪、跨月、单日、除零）全部在单测里验证过，UI 改动不会破坏正确性。
 */
/**
 * 为屏幕阅读器生成色条的文字描述。
 * 色条的颜色承载了状态信息，但颜色不能是唯一的信息载体 —— 所以把状态、起止、
 * 截止时间都写进 aria-label，读屏用户能获得与视觉用户等价的全部信息。
 */
function describeBar(activity, row) {
  const parts = [
    activity.title,
    typeLabel(activity.type),
    statusLabel(activity.status),
    `${fmtDate(activity.startAt)} 至 ${fmtDate(activity.endAt)}`,
    `持续 ${row.durationDays} 天`,
    `报名截止 ${fmtDate(activity.signupDeadline)}`,
  ];
  if (row.clippedStart) parts.push('开始时间早于当前视图');
  if (row.clippedEnd) parts.push('结束时间晚于当前视图');
  return parts.join('，');
}

export default function TimelineChart({ model, window: win, onSelect }) {
  const { rows, ticks, todayPct } = model;
  const navigate = useNavigate();

  const go = (id) => {
    if (onSelect) onSelect(id);
    else navigate(`/activities/${id}`);
  };

  return (
    <div className="tl-body" role="group" aria-label={`活动时间轴，共 ${rows.length} 个活动`}>
      <div className="tl-canvas">
        {/* 时间轴刻度 */}
        <div className="tl-axis">
          <div aria-hidden="true" />
          <div className="tl-axis-track">
            {ticks.map((t, i) => (
              <span
                key={`${t.ratio}-${i}`}
                className={`tl-tick${t.isAnchor ? ' is-anchor' : ''}`}
                style={{ left: `${t.ratio}%` }}
              >
                {t.label}
              </span>
            ))}
            {todayPct !== null ? (
              <span className="tl-today-flag" style={{ left: `${todayPct}%` }}>
                今天
              </span>
            ) : null}
          </div>
        </div>

        {/* 活动行 */}
        <div className="tl-rows">
          {rows.map((row) => {
            const a = row.activity;
            const color = STATUS_BAR_COLORS[a.status] ?? 'var(--c-primary)';
            const barClass = [
              'tl-bar',
              a.status === 'ended' ? 'is-ended' : '',
              a.status === 'ongoing' ? 'is-ongoing' : '',
              row.clippedStart ? 'clip-start' : '',
              row.clippedEnd ? 'clip-end' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const labelInside = row.widthPct >= INSIDE_LABEL_MIN_WIDTH;
            const roomRight = 100 - (row.leftPct + row.widthPct);
            const labelOnRight = roomRight > LABEL_RIGHT_MIN_ROOM;

            return (
              <div className="tl-row" key={a.id}>
                <div className="tl-label">
                  <div className="tl-label-title" title={a.title}>
                    {a.title}
                  </div>
                  <div className="tl-label-meta">
                    {typeLabel(a.type)} · {row.durationDays} 天 · {statusLabel(a.status)}
                  </div>
                </div>

                <div className="tl-track">
                  {/* 竖向网格线，与刻度对齐（纯装饰） */}
                  {ticks.map((t, i) => (
                    <div
                      key={`g-${i}`}
                      className={`tl-grid-line${t.isAnchor ? ' is-anchor' : ''}`}
                      style={{ left: `${t.ratio}%` }}
                      aria-hidden="true"
                    />
                  ))}

                  {/* 今天基准线：贯穿每一行，保证竖直方向连续（纯装饰） */}
                  {todayPct !== null ? (
                    <div className="tl-today-line" style={{ left: `${todayPct}%` }} aria-hidden="true" />
                  ) : null}

                  {/* 活动区间：宽度 ∝ 持续时长 */}
                  <button
                    type="button"
                    className={barClass}
                    style={{
                      left: `${row.leftPct}%`,
                      width: `${row.widthPct}%`,
                      '--bar-color': color,
                    }}
                    onClick={() => go(a.id)}
                    aria-label={describeBar(a, row)}
                    title={`${a.title}\n${fmtShort(a.startAt)} → ${fmtShort(a.endAt)}\n报名截止 ${fmtShort(
                      a.signupDeadline,
                    )}`}
                  >
                    {labelInside ? (
                      <>
                        {row.clippedStart ? '« ' : ''}
                        <span className="nowrap">{a.title}</span>
                        <span className="tl-bar-days">
                          {row.durationDays > 1 ? `${row.durationDays}天` : ''}
                        </span>
                        {row.clippedEnd ? ' »' : ''}
                      </>
                    ) : null}
                  </button>

                  {/* 窄色条的标题画在外侧，避免被裁成碎片 */}
                  {!labelInside ? (
                    <span
                      className="tl-bar-label"
                      style={
                        labelOnRight
                          ? { left: `calc(${row.leftPct + row.widthPct}% + 16px)` }
                          : { right: `calc(${100 - row.leftPct}% + 16px)` }
                      }
                    >
                      {a.title}
                      {row.durationDays > 1 ? ` · ${row.durationDays}天` : ''}
                    </span>
                  ) : null}

                  {/* 报名截止：与色条形状刻意不同的独立标记（信息已并入色条的 aria-label） */}
                  {row.deadlineInWindow ? (
                    <div
                      className="tl-deadline"
                      style={{ left: `${row.deadlinePct}%` }}
                      aria-hidden="true"
                    >
                      <span className="tl-deadline-label">报名截止</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
