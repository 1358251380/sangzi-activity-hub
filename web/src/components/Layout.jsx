import { NavLink, Outlet } from 'react-router-dom';

const LINKS = [
  { to: '/', label: '活动浏览', end: true },
  { to: '/timeline', label: '时间轴' },
  { to: '/manage', label: '我的发布' },
];

/**
 * 全局布局：常驻顶部导航 + 内容区 + 页脚。
 * 导航常驻是任务书「页面要有清楚的导航」的直接落点。
 */
export default function Layout() {
  return (
    <div className="shell">
      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="nav-brand">
            <img src="/favicon.svg" alt="" width="26" height="26" />
            桑梓活动聚合
            <small>校园活动 · 时间轴</small>
          </NavLink>

          <nav className="nav-links">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
            <NavLink
              to="/publish"
              className={({ isActive }) => `nav-link nav-cta${isActive ? ' active' : ''}`}
            >
              + 发布活动
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        桑梓实验室 2026 纳新项目 · 校园活动聚合与时间轴系统 · 页面数据均为示例
      </footer>
    </div>
  );
}
