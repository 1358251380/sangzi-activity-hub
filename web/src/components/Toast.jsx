/**
 * 全局 Toast：所有写操作的成功/失败提示都走这里，
 * 满足任务书「操作后要有明确提示」的要求。
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const remove = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', duration = 3600) => {
      seq.current += 1;
      const id = seq.current;
      setItems((list) => [...list, { id, message, type }]);
      window.setTimeout(() => remove(id), duration);
      return id;
    },
    [remove],
  );

  const value = useMemo(
    () => ({
      push,
      info: (m, d) => push(m, 'info', d),
      success: (m, d) => push(m, 'success', d),
      error: (m, d) => push(m, 'error', d ?? 5000),
      warn: (m, d) => push(m, 'warn', d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
