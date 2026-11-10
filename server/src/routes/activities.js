/**
 * 活动相关路由：/api/activities
 */
import { Router } from 'express';
import {
  createActivity,
  createComment,
  deleteActivity,
  getActivityById,
  listActivities,
  listComments,
  updateActivity,
} from '../lib/repository.js';
import { parseListQuery, validateActivityInput, validateCommentInput } from '../lib/validate.js';
import { badRequest, notFound, validationFailed } from '../middleware/errors.js';

/** 解析并校验路径中的 id */
function parseId(raw) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('活动 ID 不合法');
  return id;
}

/** PATCH 语义：把已有记录合并回"输入形状"，再整体校验 */
function toInputShape(dto) {
  return {
    title: dto.title,
    type: dto.type,
    publisherType: dto.publisherType,
    publisherName: dto.publisherName,
    audience: dto.audience,
    startAt: dto.startAt,
    endAt: dto.endAt,
    signupDeadline: dto.signupDeadline,
    description: dto.description,
    link: dto.link,
    coverColor: dto.coverColor,
  };
}

export function activitiesRouter({ db }) {
  const router = Router();

  // GET /api/activities —— 列表 + 搜索 + 筛选 + 分页
  router.get('/', (req, res) => {
    const options = parseListQuery(req.query);
    res.json(listActivities(db, options));
  });

  // GET /api/activities/:id —— 详情
  router.get('/:id', (req, res) => {
    const activity = getActivityById(db, parseId(req.params.id));
    if (!activity) throw notFound();
    res.json(activity);
  });

  // POST /api/activities —— 发布
  router.post('/', (req, res) => {
    const result = validateActivityInput(req.body);
    if (!result.ok) throw validationFailed(result.fields);
    const created = createActivity(db, result.value);
    res.status(201).json(created);
  });

  // PATCH /api/activities/:id —— 编辑（选做 S9）
  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const existing = getActivityById(db, id);
    if (!existing) throw notFound();

    const merged = { ...toInputShape(existing), ...pickDefined(req.body) };
    const result = validateActivityInput(merged);
    if (!result.ok) throw validationFailed(result.fields);

    res.json(updateActivity(db, id, result.value));
  });

  // DELETE /api/activities/:id —— 删除（选做 S9）
  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!deleteActivity(db, id)) throw notFound();
    res.status(204).end();
  });

  // GET /api/activities/:id/comments —— 评论列表
  router.get('/:id/comments', (req, res) => {
    const id = parseId(req.params.id);
    if (!getActivityById(db, id)) throw notFound();
    res.json({ items: listComments(db, id) });
  });

  // POST /api/activities/:id/comments —— 发表评论
  router.post('/:id/comments', (req, res) => {
    const id = parseId(req.params.id);
    if (!getActivityById(db, id)) throw notFound();

    const result = validateCommentInput(req.body);
    if (!result.ok) throw validationFailed(result.fields);

    res.status(201).json(createComment(db, id, result.value));
  });

  return router;
}

/** 只取显式传入的字段，保证 PATCH 是"部分更新"语义 */
function pickDefined(body = {}) {
  const keys = [
    'title',
    'type',
    'publisherType',
    'publisherName',
    'audience',
    'startAt',
    'endAt',
    'signupDeadline',
    'description',
    'link',
    'coverColor',
  ];
  const out = {};
  for (const k of keys) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}
