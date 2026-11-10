import { useState } from 'react';
import { fmtDateTime } from '../lib/time.js';

/** 头像配色：用昵称做稳定散列，同一个人始终同色 */
const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2', '#4f46e5'];

function colorOf(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}

export function CommentList({ items = [] }) {
  if (items.length === 0) {
    return (
      <p className="muted text-sm" style={{ padding: '12px 0' }}>
        还没有人留言。如果你参加过，欢迎补充报名经验和注意事项。
      </p>
    );
  }

  return (
    <div>
      {items.map((c) => (
        <div className="comment" key={c.id}>
          <div className="avatar" style={{ background: colorOf(c.nickname) }}>
            {c.nickname.slice(0, 1).toUpperCase()}
          </div>
          <div className="comment-body">
            <div className="comment-meta">
              <span className="comment-nick">{c.nickname}</span>
              <span className="comment-time">{fmtDateTime(c.createdAt)}</span>
            </div>
            <div className="comment-content">{c.content}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 发表评论表单。
 * 前端校验只是体验优化，服务端仍是权威（会返回 422 逐字段错误）。
 */
export function CommentForm({ onSubmit }) {
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!nickname.trim()) next.nickname = '「昵称」不能为空';
    if (!content.trim()) next.content = '评论内容不能为空';
    if (content.trim().length > 500) next.content = '评论内容不能超过 500 字';
    if (nickname.trim().length > 20) next.nickname = '昵称不能超过 20 字';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ nickname: nickname.trim(), content: content.trim() });
      setContent('');
    } catch (err) {
      if (err?.fields) setErrors(err.fields);
      else setErrors({ content: err?.message ?? '发表失败' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor="comment-nickname">
          昵称<span className="req">*</span>
        </label>
        <input
          id="comment-nickname"
          className={`input${errors.nickname ? ' invalid' : ''}`}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="怎么称呼你（不需要真实姓名）"
          maxLength={40}
        />
        {errors.nickname ? <span className="field-error">{errors.nickname}</span> : null}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="comment-content">
          内容<span className="req">*</span>
        </label>
        <textarea
          id="comment-content"
          className={`textarea${errors.content ? ' invalid' : ''}`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="补充报名经验、材料要求、注意事项…"
          rows={3}
          maxLength={600}
        />
        <div className="row-between">
          {errors.content ? (
            <span className="field-error">{errors.content}</span>
          ) : (
            <span className="field-hint">评论用于补充信息，请勿填写他人个人信息</span>
          )}
          <span className="field-hint">{content.length}/500</span>
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? '发表中…' : '发表评论'}
      </button>
    </form>
  );
}
