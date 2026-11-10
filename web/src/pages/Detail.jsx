import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PublisherBadge, StatusBadge, TypeBadge } from '../components/Badge.jsx';
import { CommentForm, CommentList } from '../components/Comments.jsx';
import { useToast } from '../components/Toast.jsx';
import { ErrorState, Loading } from '../components/States.jsx';
import { isMine, removeMyId } from '../lib/myPublish.js';
import {
  deadlineText,
  durationText,
  fmtDateTime,
  isDeadlineUrgent,
} from '../lib/time.js';

/**
 * 活动详情：完整信息 + 报名截止倒计时 + 评论区。
 * 评论区刻意放在"参与方式"附近，因为它的定位是补充报名信息，而不是社交。
 */
export default function Detail() {
  const { id } = useParams();
  const activityId = Number(id);
  const toast = useToast();
  const navigate = useNavigate();

  const [activity, setActivity] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, c] = await Promise.all([api.getActivity(activityId), api.listComments(activityId)]);
      setActivity(a);
      setComments(c.items ?? []);
    } catch (err) {
      setError(err.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleComment(payload) {
    try {
      const created = await api.createComment(activityId, payload);
      setComments((list) => [created, ...list]);
      setActivity((a) => (a ? { ...a, commentCount: a.commentCount + 1 } : a));
      toast.success('评论已发表');
    } catch (err) {
      if (err?.fields) throw err; // 交给表单逐字段展示
      toast.error(err.message ?? '发表失败');
      throw err;
    }
  }

  async function handleDelete() {
    if (!window.confirm('确定删除这个活动吗？删除后关联的评论也会一并删除，且无法恢复。')) return;
    setDeleting(true);
    try {
      await api.deleteActivity(activityId);
      removeMyId(activityId);
      toast.success('活动已删除');
      navigate('/manage', { replace: true });
    } catch (err) {
      toast.error(err.message ?? '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <Loading text="正在加载活动详情…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!activity) return null;

  const mine = isMine(activity.id);
  const urgent = activity.signupOpen && isDeadlineUrgent(activity.signupDeadline);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/" className="btn btn-ghost btn-sm">
          ← 返回列表
        </Link>
        <Link to="/timeline" className="btn btn-ghost btn-sm">
          在时间轴中查看
        </Link>
        {mine ? (
          <div className="row" style={{ marginLeft: 'auto' }}>
            <Link to={`/publish?edit=${activity.id}`} className="btn btn-sm">
              编辑
            </Link>
            <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? '删除中…' : '删除'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="detail-grid">
        <article className="card detail-card">
          <div className="detail-badges">
            <TypeBadge type={activity.type} />
            <PublisherBadge type={activity.publisherType} name={activity.publisherName} />
            <StatusBadge status={activity.status} />
          </div>

          <h1 className="detail-title">{activity.title}</h1>

          <p className="muted text-sm">
            面向 {activity.audience} · 持续 {durationText(activity.startAt, activity.endAt)}
          </p>

          <section className="detail-section">
            <h3>活动介绍</h3>
            <p className="detail-text">{activity.description}</p>
          </section>

          <section className="detail-section">
            <h3>参与方式</h3>
            {activity.link ? (
              <a href={activity.link} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                🔗 打开活动链接
              </a>
            ) : (
              <p className="detail-text muted">发布者未提供外部链接，请参考活动介绍中的说明。</p>
            )}
          </section>

          <section className="detail-section">
            <div className="comments-head">
              <h3>经验与注意事项</h3>
              <span className="badge badge-type">{comments.length} 条</span>
            </div>
            <CommentList items={comments} />
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f1f2f6' }}>
              <h3 style={{ marginBottom: 12 }}>补充一条经验</h3>
              <CommentForm onSubmit={handleComment} />
            </div>
          </section>
        </article>

        <aside>
          <div className="card side-card">
            <div className={`countdown${activity.signupOpen ? '' : ' closed'}`}>
              <div className="countdown-label">报名截止</div>
              <div className="countdown-value">
                {activity.signupOpen ? deadlineText(activity.signupDeadline) : '报名已截止'}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {fmtDateTime(activity.signupDeadline)}
              </div>
            </div>

            <div className="side-title">时间信息</div>
            <div className="kv">
              <span className="kv-key">活动开始</span>
              <span className="kv-val">{fmtDateTime(activity.startAt)}</span>
            </div>
            <div className="kv">
              <span className="kv-key">活动结束</span>
              <span className="kv-val">{fmtDateTime(activity.endAt)}</span>
            </div>
            <div className="kv">
              <span className="kv-key">报名截止</span>
              <span className={`kv-val${urgent ? ' deadline-urgent' : ''}`}>
                {fmtDateTime(activity.signupDeadline)}
              </span>
            </div>
            <div className="kv">
              <span className="kv-key">持续时长</span>
              <span className="kv-val">{durationText(activity.startAt, activity.endAt)}</span>
            </div>
          </div>

          <div className="card side-card">
            <div className="side-title">发布信息</div>
            <div className="kv">
              <span className="kv-key">发布者类型</span>
              <span className="kv-val">
                <PublisherBadge type={activity.publisherType} />
              </span>
            </div>
            <div className="kv">
              <span className="kv-key">发布者</span>
              <span className="kv-val">{activity.publisherName}</span>
            </div>
            <div className="kv">
              <span className="kv-key">面向对象</span>
              <span className="kv-val">{activity.audience}</span>
            </div>
            <div className="kv">
              <span className="kv-key">发布时间</span>
              <span className="kv-val">{fmtDateTime(activity.createdAt)}</span>
            </div>
          </div>

          <p className="muted text-sm">页面数据为示例数据，仅用于功能演示。</p>
        </aside>
      </div>
    </>
  );
}
