import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import ActivityCard from '../components/ActivityCard.jsx';
import FilterBar from '../components/FilterBar.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';

const EMPTY_FILTERS = { q: '', type: '', publisherType: '', audience: '', sort: 'startAt' };

/**
 * 活动浏览首页：卡片列表 + 搜索 + 筛选。
 * 关键词输入做 220ms 防抖，并用请求序号防止竞态覆盖。
 */
export default function Browse() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  useEffect(() => {
    api
      .options()
      .then(setOptions)
      .catch(() => {
        /* 字典接口失败不阻塞主流程，下拉框降级为只有"全部" */
      });
  }, []);

  useEffect(() => {
    const myId = (reqId.current += 1);
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.listActivities({ ...filters, pageSize: 60, order: 'asc' });
        if (myId !== reqId.current) return; // 已有更新的请求，丢弃本次结果
        setData(res);
      } catch (err) {
        if (myId !== reqId.current) return;
        setError(err.message ?? '加载失败');
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [filters]);

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">活动浏览</h1>
          <p className="page-sub">
            学院、学生组织和个人发布的活动与竞赛都汇总在这里。点开卡片可以查看报名方式与学长学姐的经验。
          </p>
        </div>
        <Link to="/publish" className="btn btn-primary">
          + 发布一个活动
        </Link>
      </div>

      <FilterBar value={filters} onChange={setFilters} options={options} total={total} />

      {loading && !data ? <Loading text="正在加载活动…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => setFilters({ ...filters })} /> : null}

      {!error && data && items.length === 0 ? (
        <Empty
          icon="🔍"
          title="没有找到符合条件的活动"
          desc="换个关键词，或清空筛选条件再看看。"
          action={
            <button type="button" className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>
              清空筛选
            </button>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <div className="activity-grid">
          {items.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </div>
      ) : null}

      {data && total > items.length ? (
        <p className="muted text-sm" style={{ marginTop: 16, textAlign: 'center' }}>
          已显示前 {items.length} 条，共 {total} 条。可用筛选条件缩小范围。
        </p>
      ) : null}
    </>
  );
}
