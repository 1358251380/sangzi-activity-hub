/**
 * 空状态 / 加载中 / 错误状态。三种占位集中在一处，保证全站观感一致。
 */

export function Loading({ text = '加载中…' }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function Empty({ icon = '🗓️', title = '这里还没有内容', desc, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {desc ? <div className="empty-desc">{desc}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-box">
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
