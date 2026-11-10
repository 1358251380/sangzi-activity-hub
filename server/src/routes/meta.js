/**
 * 杂项路由：健康检查、枚举字典、时间轴数据。
 */
import { Router } from 'express';
import { listForTimeline, pingDatabase } from '../lib/repository.js';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  PUBLISHER_TYPES,
  PUBLISHER_TYPE_LABELS,
  parseListQuery,
} from '../lib/validate.js';
import { HttpError } from '../middleware/errors.js';

const STARTED_AT = Date.now();

/**
 * GET /api/health —— 供 Docker healthcheck / 运维巡检使用。
 * 数据库不可用时返回 503，让编排层能感知故障而不只是看端口通。
 */
export function healthRouter({ db }) {
  const router = Router();
  router.get('/', (_req, res) => {
    const dbOk = pingDatabase(db);
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      uptime: Number(((Date.now() - STARTED_AT) / 1000).toFixed(1)),
      version: process.env.npm_package_version ?? '1.0.0',
      time: new Date().toISOString(),
    });
  });
  return router;
}

/** GET /api/meta/options —— 前端下拉框字典，避免枚举在前后端各写一份 */
export function metaRouter() {
  const router = Router();
  router.get('/options', (_req, res) => {
    res.json({
      activityTypes: ACTIVITY_TYPES.map((v) => ({ value: v, label: ACTIVITY_TYPE_LABELS[v] })),
      publisherTypes: PUBLISHER_TYPES.map((v) => ({ value: v, label: PUBLISHER_TYPE_LABELS[v] })),
      audiences: ['全校', '计算机学院', '电子信息学院', '文学院', '2024 级', '2025 级', '2026 级'],
      sorts: [
        { value: 'startAt', label: '按开始时间' },
        { value: 'signupDeadline', label: '按报名截止' },
        { value: 'createdAt', label: '按发布时间' },
      ],
      statuses: [
        { value: 'signup_open', label: '报名中' },
        { value: 'signup_closed', label: '报名已截止' },
        { value: 'ongoing', label: '进行中' },
        { value: 'ended', label: '已结束' },
      ],
    });
  });
  return router;
}

/**
 * GET /api/timeline —— 返回与 [from, to) 有交集的活动。
 * 只做数据筛选，坐标计算交给前端纯函数（见 docs/03）。
 */
export function timelineRouter({ db }) {
  const router = Router();
  router.get('/', (req, res) => {
    const options = parseListQuery(req.query);
    if (!options.from || !options.to) {
      throw new HttpError(400, 'BAD_REQUEST', '时间轴接口必须提供 from 与 to 参数');
    }
    if (Date.parse(options.to) <= Date.parse(options.from)) {
      throw new HttpError(400, 'BAD_REQUEST', 'to 必须晚于 from');
    }
    res.json({
      from: options.from,
      to: options.to,
      items: listForTimeline(db, options),
    });
  });
  return router;
}
