import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import TimelineChart from '../components/TimelineChart.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import {
  WINDOW_MODE_LABELS,
  buildTimeline,
  shiftWindow,
  windowLabel,
  windowOf,
} from '../lib/timeline.js';

/**
 * 时间轴页面。
 *
 * 数据流：窗口(window) → 请求 /api/timeline → 纯函数 buildTimeline 投影 → 渲染。
 * 窗口变化时只重新取数据，几何计算全在纯函数里，所以切换周/月/季不会出现错位。
 */
export default function TimelinePage() {
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  const win = useMemo(() => windowOf(anchor, mode), [anchor, mode]);
  const fromIso = win.start.toISOString();
  const toIso = win.end.toISOString();

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    api
      .timeline({ from: fromIso, to: toIso })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: null, items: res.items ?? [] });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, error: err.message ?? '加载失败', items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso]);

  const model = useMemo(
    () => buildTimeline(state.items, win, new Date()),
    [state.items, win],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">时间轴</h1>
          <p className="page-sub">
            横条长度代表活动持续天数；菱形标记是<b>报名截止</b>，与活动举办时间是两件不同的事。
          </p>
        </div>
        <Link to="/publish" className="btn btn-primary">
          + 发布一个活动
        </Link>
      </div>

      <div className="timeline-panel">
        <div className="timeline-toolbar">
          <div className="seg" role="group" aria-label="时间粒度">
            {['week', 'month', 'quarter'].map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? 'active' : ''}
                onClick={() => setMode(m)}
              >
                {WINDOW_MODE_LABELS[m]}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setAnchor((a) => shiftWindow({ ...win, mode }, -1).start ?? a)}
            aria-label="上一段"
          >
            ←
          </button>

          {/* 用 shiftWindow 的结果反推锚点，保证模式切换后仍停在同一时期 */}
          <span className="timeline-range">{windowLabel(win)}</span>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setAnchor((a) => shiftWindow({ ...win, mode }, 1).start ?? a)}
            aria-label="下一段"
          >
            →
          </button>

          <button type="button" className="btn btn-sm" onClick={() => setAnchor(new Date())}>
            回到今天
          </button>

          <div className="timeline-stats">
            <span>
              共 <b>{model.stats.total}</b> 个
            </span>
            <span>
              报名中 <b>{model.stats.signupOpen}</b>
            </span>
            <span>
              进行中 <b>{model.stats.ongoing}</b>
            </span>
            {model.stats.clipped > 0 ? (
              <span title="活动时间超出当前窗口，两端以箭头表示还有内容">
                跨窗口 <b>{model.stats.clipped}</b>
              </span>
            ) : null}
          </div>
        </div>

        {state.loading ? <Loading text="正在加载时间轴…" /> : null}
        {state.error ? <ErrorState message={state.error} onRetry={() => setMode(mode)} /> : null}

        {!state.loading && !state.error && model.empty ? (
          <Empty
            icon="📅"
            title="这段时间没有活动"
            desc="试试切换到更宽的时间范围，或者发布一个新活动。"
            action={
              <button type="button" className="btn" onClick={() => setMode('quarter')}>
                看本季度
              </button>
            }
          />
        ) : null}

        {!state.loading && !state.error && !model.empty ? (
          <TimelineChart model={model} window={win} />
        ) : null}

        <div className="tl-legend">
          <span className="tl-legend-item">
            <span className="tl-legend-swatch" style={{ background: '#059669' }} /> 报名中
          </span>
          <span className="tl-legend-item">
            <span className="tl-legend-swatch" style={{ background: '#64748b' }} /> 报名已截止
          </span>
          <span className="tl-legend-item">
            <span className="tl-legend-swatch" style={{ background: '#2563eb' }} /> 进行中
          </span>
          <span className="tl-legend-item">
            <span className="tl-legend-swatch" style={{ background: '#cbd5e1' }} /> 已结束
          </span>
          <span className="tl-legend-item">
            <span className="tl-legend-diamond" /> 报名截止时刻
          </span>
          <span className="tl-legend-item">
            <span style={{ width: 2, height: 14, background: '#dc2626', opacity: 0.55 }} /> 今天
          </span>
          <span className="tl-legend-item muted">色条两端的 « » 表示活动超出当前窗口</span>
        </div>
      </div>
    </>
  );
}
