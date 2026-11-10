/**
 * 筛选栏：关键词 + 活动类型 + 发布者类型 + 面向对象 + 排序。
 * 任务书 F5 要求"至少实现一种查找方式"，这里做到条件可组合、可一键清空。
 */
export default function FilterBar({ value, onChange, options, total }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  const types = options?.activityTypes ?? [];
  const publishers = options?.publisherTypes ?? [];
  const audiences = options?.audiences ?? [];

  const dirty =
    value.q || value.type || value.publisherType || value.audience || value.sort !== 'startAt';

  return (
    <div className="filter-bar">
      <input
        className="input filter-search"
        type="search"
        placeholder="搜索活动名称或介绍…"
        value={value.q}
        onChange={set('q')}
        aria-label="关键词搜索"
      />

      <select className="select" value={value.type} onChange={set('type')} aria-label="活动类型">
        <option value="">全部类型</option>
        {types.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select
        className="select"
        value={value.publisherType}
        onChange={set('publisherType')}
        aria-label="发布者类型"
      >
        <option value="">全部发布者</option>
        {publishers.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select
        className="select"
        value={value.audience}
        onChange={set('audience')}
        aria-label="面向对象"
      >
        <option value="">全部对象</option>
        {audiences.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <select className="select" value={value.sort} onChange={set('sort')} aria-label="排序方式">
        <option value="startAt">按开始时间</option>
        <option value="signupDeadline">按报名截止</option>
        <option value="createdAt">按发布时间</option>
      </select>

      {dirty ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            onChange({ q: '', type: '', publisherType: '', audience: '', sort: 'startAt' })
          }
        >
          清空筛选
        </button>
      ) : null}

      <span className="filter-count">共 {total ?? 0} 个活动</span>
    </div>
  );
}
