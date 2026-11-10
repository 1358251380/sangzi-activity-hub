import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { PublisherBadge, StatusBadge, TypeBadge } from '../components/Badge.jsx';
import { useToast } from '../components/Toast.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { getMyIds, removeMyId } from '../lib/myPublish.js';
import { fmtRange } from '../lib/time.js';

/**
 * 我的发布：本浏览器发布过的活动，可编辑或删除（选做 S9）。
 * 无账号体系下用 localStorage 划定权限边界，避免"谁都能删别人的活动"。
 */
export default function Manage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = getMyIds();
      if (ids.length === 0) {
        setItems([]);
        return;
      }
      const settled = await Promise.allSettled(ids.map((id) => api.getActivity(id)));
      const alive = settled
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value);

      // 已在别处被删除的 id 顺手清理
      const aliveIds = new Set(alive.map((a) => a.id));
      for (const id of ids) if (!aliveIds.has(id)) removeMyId(id);

      setItems(alive);
    } catch (err) {
      setError(err.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(activity) {
    if (!window.confirm(`确定删除「${activity.title}」吗？关联评论也会删除。`)) return;
    setBusyId(activity.id);
    try {
      await api.deleteActivity(activity.id);
      removeMyId(activity.id);
      setItems((list) => list.filter((a) => a.id !== activity.id));
      toast.success('已删除');
    } catch (err) {
      toast.error(err.message ?? '删除失败');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading text="正在加载我的发布…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">我的发布</h1>
          <p className="page-sub">
            这里只显示<b>本浏览器</b>发布过的活动（项目未做账号系统，权限边界用本地记录实现）。
          </p>
        </div>
        <Link to="/publish" className="btn btn-primary">
          + 发布一个活动
        </Link>
      </div>

      {items.length === 0 ? (
        <Empty
          icon="📝"
          title="你还没有发布过活动"
          desc="发布一个活动后，就能在这里编辑或删除它。"
          action={
            <Link to="/publish" className="btn btn-primary">
              去发布
            </Link>
          }
        />
      ) : (
        <div className="stack">
          {items.map((a) => (
            <div className="card card-pad" key={a.id}>
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <TypeBadge type={a.type} />
                    <PublisherBadge type={a.publisherType} name={a.publisherName} />
                    <StatusBadge status={a.status} />
                  </div>
                  <Link to={`/activities/${a.id}`} className="card-title" style={{ display: 'block' }}>
                    {a.title}
                  </Link>
                  <div className="muted text-sm" style={{ marginTop: 4 }}>
                    {fmtRange(a.startAt, a.endAt)} · 面向 {a.audience} · 💬 {a.commentCount} 条评论
                  </div>
                </div>

                <div className="row" style={{ flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => navigate(`/publish?edit=${a.id}`)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(a)}
                    disabled={busyId === a.id}
                  >
                    {busyId === a.id ? '删除中…' : '删除'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
