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
 * 健康检查（分层）。
 *
 * 为什么要分 liveness 与 readiness：
 *   两者的语义完全不同，混用会导致「容器该不该重启」和「流量该不该转发」判断错。
 *
 *   - liveness（存活）：进程是否还能响应。只证明事件循环没死，**不查外部依赖**。
 *     查库会导致：数据库短暂抖动 → 容器被判死亡 → 被重启 → 抖动被放大成雪崩。
 *   - readiness（就绪）：现在能不能对外服务，**必须查 DB**。
 *     不就绪时编排层应把流量摘走，但不必重启容器。
 *
 *   /api/health 保留为聚合视图（等同于 readiness + 运行信息），兼容既有调用与人工巡检。
 */
export function healthRouter({ db }) {
  const router = Router();

  const snapshot = () => {
    const dbOk = pingDatabase(db);
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      uptime: Number(((Date.now() - STARTED_AT) / 1000).toFixed(1)),
      version: process.env.npm_package_version ?? '1.0.0',
      time: new Date().toISOString(),
    };
  };

  // liveness：只证明进程活着，不依赖数据库
  router.get('/live', (_req, res) => {
    res.status(200).json({
      status: 'alive',
      uptime: Number(((Date.now() - STARTED_AT) / 1000).toFixed(1)),
      time: new Date().toISOString(),
    });
  });

  // readiness：依赖可用才返回 200，否则 503（编排层据此摘流量）
  router.get('/ready', (_req, res) => {
    const body = snapshot();
    res.status(body.db === 'ok' ? 200 : 503).json(body);
  });

  // 聚合视图：人工巡检 / 既有脚本使用
  router.get('/', (_req, res) => {
    const body = snapshot();
    res.status(body.db === 'ok' ? 200 : 503).json(body);
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
