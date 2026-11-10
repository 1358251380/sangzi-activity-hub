import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: '活动浏览', end: true },
  { to: '/timeline', label: '时间轴' },
  { to: '/manage', label: '我的发布' },
];

const SITE = '桑梓 · 校园活动聚合';

/** 路由 → 浏览器标题。浏览器标签页与屏幕阅读器都依赖它判断当前页面 */
function titleOf(pathname) {
  if (pathname === '/') return `活动浏览 · ${SITE}`;
  if (pathname.startsWith('/timeline')) return `时间轴 · ${SITE}`;
  if (pathname.startsWith('/publish')) return `发布活动 · ${SITE}`;
  if (pathname.startsWith('/manage')) return `我的发布 · ${SITE}`;
  if (pathname.startsWith('/activities/')) return `活动详情 · ${SITE}`;
  return `页面不存在 · ${SITE}`;
}

/**
 * 全局布局：常驻顶部导航 + 内容区 + 页脚。
 *
 * 无障碍要点：
 * - 「跳到主内容」让键盘用户不必逐个 Tab 穿过导航
 * - 路由切换后把焦点移入主内容，屏幕阅读器才会感知页面已变化
 * - 同步 document.title
 * - NavLink 对当前项自动输出 aria-current="page"，无需手写
 */
export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    document.title = titleOf(location.pathname);

    // 首屏不抢焦点，只在后续路由切换时移动
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        跳到主内容
      </a>

      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="nav-brand">
            <img src="/favicon.svg" alt="" width="26" height="26" />
            <span className="nav-brand-text">桑梓活动聚合</span>
            <small>校园活动 · 时间轴</small>
          </NavLink>

          <nav className="nav-links" aria-label="主导航">
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

      <main className="main" id="main" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="footer">
        桑梓实验室 2026 纳新项目 · 校园活动聚合与时间轴系统 · 页面数据均为示例
      </footer>
    </div>
  );
}
