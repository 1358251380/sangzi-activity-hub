/**
 * 空状态 / 加载中 / 错误状态。三种占位集中在一处，保证全站观感一致。
 *
 * 无障碍：
 * - Loading 用 role="status" + aria-live，屏幕阅读器会播报
 * - ErrorState 用 role="alert"，出错时立即播报
 * - 装饰性图标 aria-hidden，避免读出无意义的 emoji 名称
 */

export function Loading({ text = '加载中…' }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function Empty({ icon = '🗓️', title = '这里还没有内容', desc, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty-title">{title}</div>
      {desc ? <div className="empty-desc">{desc}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <strong>出错了：</strong>
      {message}
      {onRetry ? (
        <button type="button" className="btn btn-sm" style={{ marginLeft: 12 }} onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}
