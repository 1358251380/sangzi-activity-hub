import {
  publisherLabel,
  statusLabel,
  typeLabel,
} from '../lib/labels.js';

export function TypeBadge({ type }) {
  return <span className="badge badge-type">{typeLabel(type)}</span>;
}

/** 发布者类型徽标 —— 三类发布者在视觉上可区分（任务书 F1 要求） */
export function PublisherBadge({ type, name }) {
  return (
    <span className={`badge badge-publisher-${type}`}>
      {publisherLabel(type)}
      {name ? ` · ${name}` : ''}
    </span>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className={`badge badge-status-${status}`}>
      <span className="badge-dot" />
      {statusLabel(status)}
    </span>
  );
}
