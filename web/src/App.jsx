import { Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { Empty } from './components/States.jsx';
import Browse from './pages/Browse.jsx';
import TimelinePage from './pages/TimelinePage.jsx';
import Detail from './pages/Detail.jsx';
import Publish from './pages/Publish.jsx';
import Manage from './pages/Manage.jsx';

function NotFound() {
  return (
    <Empty
      icon="🧭"
      title="页面不存在"
      desc="链接可能已失效，回到活动列表重新开始吧。"
      action={
        <Link to="/" className="btn btn-primary">
          返回活动列表
        </Link>
      }
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Browse />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/activities/:id" element={<Detail />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
