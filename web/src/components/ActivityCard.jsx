import { Link } from 'react-router-dom';
import { PublisherBadge, StatusBadge, TypeBadge } from './Badge.jsx';
import { PUBLISHER_ACCENT } from '../lib/labels.js';
import { deadlineText, durationText, fmtRange, isDeadlineUrgent } from '../lib/time.js';

/**
 * 活动卡片。
 *
 * 任务书 F1 要求"至少包含：名称、类型、发布者、开始时间、结束时间、报名截止时间"，
 * 因此这里把三个时间显式分行展示，且报名截止单独一行并带倒计时，
 * 从视觉上保证"报名截止 ≠ 活动时间"这件事不会被误读。
 */
export default function ActivityCard({ activity, now = new Date() }) {
  const {
    id,
    title,
    type,
    publisherType,
    publisherName,
    audience,
    startAt,
    endAt,
    signupDeadline,
    status,
    signupOpen,
    commentCount,
  } = activity;

  const urgent = signupOpen && isDeadlineUrgent(signupDeadline, now);

  return (
    <Link
      to={`/activities/${id}`}
      className={`activity-card${status === 'ended' ? ' is-ended' : ''}`}
      style={{ '--card-accent': PUBLISHER_ACCENT[publisherType] }}
      aria-label={`${title}，${publisherName} 发布`}
    >
      <div className="card-top">
        <TypeBadge type={type} />
        <StatusBadge status={status} />
      </div>

      <h3 className="card-title">{title}</h3>

      <div className="card-publisher">
        <PublisherBadge type={publisherType} name={publisherName} />
        <span className="muted">面向 {audience}</span>
      </div>

      <div className="card-times">
        <div className="card-time-row">
          <span className="card-time-key">开始</span>
          <span className="card-time-val strong">{fmtRange(startAt, endAt).split(' – ')[0]}</span>
        </div>
        <div className="card-time-row">
          <span className="card-time-key">结束</span>
          <span className="card-time-val">{fmtRange(startAt, endAt).split(' – ')[1]}</span>
        </div>
        <div className="card-time-row">
          <span className="card-time-key">报名截止</span>
          <span className={`card-time-val${urgent ? ' deadline-urgent' : ''}`}>
            {fmtRange(signupDeadline, signupDeadline).split(' – ')[0]}
            <span className="muted"> · </span>
            {deadlineText(signupDeadline, now)}
          </span>
        </div>
      </div>

      <div className="card-foot">
        <span className="card-days">持续 {durationText(startAt, endAt)}</span>
        <span>{commentCount > 0 ? `💬 ${commentCount} 条经验` : '暂无评论'}</span>
      </div>
    </Link>
  );
}
