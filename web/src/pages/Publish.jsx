import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { ErrorState, Loading } from '../components/States.jsx';
import { addMyId } from '../lib/myPublish.js';
import { PUBLISHER_TYPE_LABELS, ACTIVITY_TYPE_LABELS } from '../lib/labels.js';
import { fromLocalInputValue, toLocalInputValue } from '../lib/time.js';

const EMPTY_FORM = {
  title: '',
  type: 'lecture',
  publisherType: 'college',
  publisherName: '',
  audience: '全校',
  startAt: '',
  endAt: '',
  signupDeadline: '',
  description: '',
  link: '',
};

/**
 * 前端校验：与后端 server/src/lib/validate.js 保持同一套规则与文案。
 * 这里只是为了即时反馈，最终结果仍以服务端 422 为准。
 */
function validateClient(form) {
  const errors = {};

  if (!form.title.trim()) errors.title = '「活动名称」不能为空';
  else if (form.title.trim().length > 100) errors.title = '「活动名称」不能超过 100 字';

  if (!form.publisherName.trim()) errors.publisherName = '「发布者名称」不能为空';
  else if (form.publisherName.trim().length > 50) errors.publisherName = '「发布者名称」不能超过 50 字';

  if (!form.audience.trim()) errors.audience = '「面向对象」不能为空';

  if (!form.startAt) errors.startAt = '请填写有效的开始时间';
  if (!form.endAt) errors.endAt = '请填写有效的结束时间';
  if (!form.signupDeadline) errors.signupDeadline = '请填写有效的报名截止时间';

  if (form.startAt && form.endAt && new Date(form.endAt) < new Date(form.startAt)) {
    errors.endAt = '结束时间不能早于开始时间';
  }
  if (form.endAt && form.signupDeadline && new Date(form.signupDeadline) > new Date(form.endAt)) {
    errors.signupDeadline = '报名截止时间不能晚于活动结束时间';
  }

  if (!form.description.trim()) errors.description = '「活动介绍」不能为空';
  else if (form.description.trim().length > 5000) errors.description = '「活动介绍」不能超过 5000 字';

  if (form.link.trim() && !/^https?:\/\/\S+$/i.test(form.link.trim())) {
    errors.link = '相关链接需以 http:// 或 https:// 开头';
  }

  return errors;
}

export default function Publish() {
  const [searchParams] = useSearchParams();
  const editId = Number(searchParams.get('edit')) || null;
  const isEdit = Boolean(editId);

  const navigate = useNavigate();
  const toast = useToast();

  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .options()
      .then(setOptions)
      .catch(() => {});
  }, []);

  // 编辑模式：载入已有数据并回填到表单（时间要转成本地时区的 input 值）
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    setLoading(true);
    api
      .getActivity(editId)
      .then((a) => {
        if (cancelled) return;
        setForm({
          title: a.title,
          type: a.type,
          publisherType: a.publisherType,
          publisherName: a.publisherName,
          audience: a.audience,
          startAt: toLocalInputValue(a.startAt),
          endAt: toLocalInputValue(a.endAt),
          signupDeadline: toLocalInputValue(a.signupDeadline),
          description: a.description,
          link: a.link ?? '',
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message ?? '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validateClient(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error('有 ' + Object.keys(nextErrors).length + ' 项需要修改，请看标红的位置');
      return;
    }

    const payload = {
      title: form.title.trim(),
      type: form.type,
      publisherType: form.publisherType,
      publisherName: form.publisherName.trim(),
      audience: form.audience.trim(),
      startAt: fromLocalInputValue(form.startAt),
      endAt: fromLocalInputValue(form.endAt),
      signupDeadline: fromLocalInputValue(form.signupDeadline),
      description: form.description.trim(),
      link: form.link.trim() || null,
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await api.updateActivity(editId, payload)
        : await api.createActivity(payload);

      if (!isEdit) addMyId(saved.id);
      toast.success(isEdit ? '活动已更新' : '发布成功！');
      navigate(`/activities/${saved.id}`);
    } catch (err) {
      if (err?.fields) {
        setErrors(err.fields);
        toast.error('表单校验未通过：' + err.message);
      } else {
        toast.error(err.message ?? '保存失败');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <ErrorState message={loadError} />;
  if (loading) return <Loading text="正在载入活动信息…" />;

  const typeOptions =
    options?.activityTypes ??
    Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const publisherOptions =
    options?.publisherTypes ??
    Object.entries(PUBLISHER_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const audiences = options?.audiences ?? ['全校'];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{isEdit ? '编辑活动' : '发布活动'}</h1>
          <p className="page-sub">
            所有带 <span style={{ color: 'var(--c-danger)' }}>*</span> 的字段都是必填。
            发布时直接选择身份即可，不需要注册账号。
          </p>
        </div>
      </div>

      <form className="card card-pad" onSubmit={handleSubmit} noValidate>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="f-title">
              活动名称<span className="req">*</span>
            </label>
            <input
              id="f-title"
              className={`input${errors.title ? ' invalid' : ''}`}
              value={form.title}
              onChange={set('title')}
              placeholder="例如：第七届程序设计竞赛"
              maxLength={120}
            />
            {errors.title ? <span className="field-error">{errors.title}</span> : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="f-type">
              活动类型<span className="req">*</span>
            </label>
            <select id="f-type" className="select" value={form.type} onChange={set('type')}>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.type ? <span className="field-error">{errors.type}</span> : null}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="f-publisherType">
              发布者类型<span className="req">*</span>
            </label>
            <select
              id="f-publisherType"
              className="select"
              value={form.publisherType}
              onChange={set('publisherType')}
            >
              {publisherOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.publisherType ? <span className="field-error">{errors.publisherType}</span> : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="f-publisherName">
              发布者名称<span className="req">*</span>
            </label>
            <input
              id="f-publisherName"
              className={`input${errors.publisherName ? ' invalid' : ''}`}
              value={form.publisherName}
              onChange={set('publisherName')}
              placeholder="例如：计算机学院 / ACM 校队 / 你的昵称"
              maxLength={60}
            />
            {errors.publisherName ? <span className="field-error">{errors.publisherName}</span> : null}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-audience">
            面向对象<span className="req">*</span>
          </label>
          <input
            id="f-audience"
            className={`input${errors.audience ? ' invalid' : ''}`}
            value={form.audience}
            onChange={set('audience')}
            list="audience-options"
            placeholder="面向全校 / 某个学院 / 某个年级"
            maxLength={60}
          />
          <datalist id="audience-options">
            {audiences.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          {errors.audience ? <span className="field-error">{errors.audience}</span> : null}
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="f-startAt">
              开始时间<span className="req">*</span>
            </label>
            <input
              id="f-startAt"
              type="datetime-local"
              className={`input${errors.startAt ? ' invalid' : ''}`}
              value={form.startAt}
              onChange={set('startAt')}
            />
            {errors.startAt ? <span className="field-error">{errors.startAt}</span> : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="f-endAt">
              结束时间<span className="req">*</span>
            </label>
            <input
              id="f-endAt"
              type="datetime-local"
              className={`input${errors.endAt ? ' invalid' : ''}`}
              value={form.endAt}
              onChange={set('endAt')}
            />
            {errors.endAt ? <span className="field-error">{errors.endAt}</span> : null}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-signupDeadline">
            报名截止时间<span className="req">*</span>
          </label>
          <input
            id="f-signupDeadline"
            type="datetime-local"
            className={`input${errors.signupDeadline ? ' invalid' : ''}`}
            value={form.signupDeadline}
            onChange={set('signupDeadline')}
          />
          <span className="field-hint">
            报名截止和活动开始是两个不同的时间，请分别填写。截止时间不能晚于活动结束时间。
          </span>
          {errors.signupDeadline ? (
            <span className="field-error">{errors.signupDeadline}</span>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-description">
            活动介绍<span className="req">*</span>
          </label>
          <textarea
            id="f-description"
            className={`textarea${errors.description ? ' invalid' : ''}`}
            value={form.description}
            onChange={set('description')}
            placeholder="活动内容、参加方式、需要准备的材料…"
            rows={6}
            maxLength={5200}
          />
          <div className="row-between">
            {errors.description ? (
              <span className="field-error">{errors.description}</span>
            ) : (
              <span className="field-hint">示例数据即可，请勿填写真实同学的个人信息</span>
            )}
            <span className="field-hint">{form.description.length}/5000</span>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-link">
            相关链接
          </label>
          <input
            id="f-link"
            className={`input${errors.link ? ' invalid' : ''}`}
            value={form.link}
            onChange={set('link')}
            placeholder="https://…（选填，需以 http:// 或 https:// 开头）"
          />
          {errors.link ? <span className="field-error">{errors.link}</span> : null}
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '保存中…' : isEdit ? '保存修改' : '发布活动'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate(isEdit ? `/activities/${editId}` : '/')}
          >
            取消
          </button>
        </div>
      </form>
    </>
  );
}
