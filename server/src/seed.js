/**
 * 示例数据种子。
 *
 * 这些数据同时承担两个职责：
 *   1. 让评审不用注册就能看到完整界面
 *   2. 覆盖 docs/03 时间轴设计说明中的 E1–E14 全部边界场景
 *
 * 全部为自编虚构内容，不含任何真实同学信息（任务书边界要求）。
 * 用法：
 *   npm run seed            # 仅当表为空时插入
 *   npm run seed -- --reset # 清空后重新插入
 */
import { openDatabase, closeDatabase } from './db.js';

/** 把 +08:00 的本地时间字面量转成 UTC ISO，避免手写换算出错 */
const local = (s) => new Date(`${s}+08:00`).toISOString();

/** 活动定义（注释标出对应的时间轴边界场景编号） */
const ACTIVITIES = [
  {
    // E1 —— 任务书原文样例：10/20 截止报名、11/15–16 举行
    title: '第七届程序设计竞赛',
    type: 'contest',
    publisherType: 'college',
    publisherName: '计算机学院',
    audience: '全校',
    startAt: local('2026-11-15T09:00:00'),
    endAt: local('2026-11-16T18:00:00'),
    signupDeadline: local('2026-10-20T23:59:00'),
    description:
      '面向全校本科生的个人赛，考察算法设计与程序实现。赛程两天：第一天热身赛与初赛，第二天决赛与颁奖。可自带电脑，现场提供电源与网络。',
    link: 'https://example.com/contest-7',
    coverColor: '#2563EB',
  },
  {
    // E2 —— 单日活动（同日 09:00–11:00）
    title: '数据库索引原理讲座',
    type: 'lecture',
    publisherType: 'college',
    publisherName: '计算机学院',
    audience: '计算机学院',
    startAt: local('2026-11-12T09:00:00'),
    endAt: local('2026-11-12T11:00:00'),
    signupDeadline: local('2026-11-11T20:00:00'),
    description: '讲解 B+ 树的组织方式、覆盖索引与最左前缀原则，附带一次现场执行计划分析。',
    link: null,
    coverColor: '#0EA5E9',
  },
  {
    // E3 —— 跨 2 日
    title: '校园程序设计冬令营',
    type: 'recruit',
    publisherType: 'org',
    publisherName: 'ACM 校队',
    audience: '全校',
    startAt: local('2026-11-20T09:00:00'),
    endAt: local('2026-11-21T17:00:00'),
    signupDeadline: local('2026-11-18T23:59:00'),
    description: '为期两天的集训，包含专题训练与模拟赛。零基础同学也可参加第一天的入门场。',
    link: 'https://example.com/winter-camp',
    coverColor: '#7C3AED',
  },
  {
    // E4 —— 跨月（10/28 → 11/03）
    title: '开源之夏校园分享周',
    type: 'club',
    publisherType: 'org',
    publisherName: '开源技术社团',
    audience: '全校',
    startAt: local('2026-10-28T09:00:00'),
    endAt: local('2026-11-03T17:00:00'),
    signupDeadline: local('2026-10-27T23:59:00'),
    description: '连续一周的每日分享，覆盖内核、前端、数据与测试工具链，可在任意一天参加。',
    link: null,
    coverColor: '#059669',
  },
  {
    // E5 —— 跨年（12/30 → 次年 01/02）
    title: '寒假算法训练营（跨年）',
    type: 'contest',
    publisherType: 'college',
    publisherName: '电子信息学院',
    audience: '全校',
    startAt: local('2026-12-30T09:00:00'),
    endAt: local('2027-01-02T17:00:00'),
    signupDeadline: local('2026-12-25T23:59:00'),
    description: '跨年的四天线上训练营，每天一次限时赛，成绩计入下学期校赛选拔。',
    link: null,
    coverColor: '#DC2626',
  },
  {
    // E6 / E13 —— 长期活动（持续 30 天）
    title: '新生编程自学打卡（30 天）',
    type: 'other',
    publisherType: 'college',
    publisherName: '计算机学院',
    audience: '2026 级',
    startAt: local('2026-11-01T00:00:00'),
    endAt: local('2026-11-30T23:59:00'),
    signupDeadline: local('2026-11-10T23:59:00'),
    description: '自主完成 30 道入门题并打卡，完成后可获第二课堂学时认证。',
    link: null,
    coverColor: '#F59E0B',
  },
  {
    // E7 —— 报名截止已过、活动尚未开始
    title: '网络安全 CTF 校内选拔',
    type: 'contest',
    publisherType: 'org',
    publisherName: '网络安全兴趣小组',
    audience: '全校',
    startAt: local('2026-11-15T10:00:00'),
    endAt: local('2026-11-15T18:00:00'),
    signupDeadline: local('2026-09-30T23:59:00'),
    description: '线上夺旗赛，选拔参加省赛的队员。报名已结束，题目范围以 Web 与逆向为主。',
    link: 'https://example.com/ctf',
    coverColor: '#0891B2',
  },
  {
    // E8 —— 活动进行中但仍可报名（截止晚于开始）
    title: '周末技术工作坊（滚动报名）',
    type: 'club',
    publisherType: 'org',
    publisherName: '前端技术社团',
    audience: '全校',
    startAt: local('2026-11-05T14:00:00'),
    endAt: local('2026-11-30T18:00:00'),
    signupDeadline: local('2026-11-20T23:59:00'),
    description: '每周六下午一次，滚动开班，报名截止前均可加入。主题从 CSS 布局到接口联调。',
    link: null,
    coverColor: '#DB2777',
  },
  {
    // E9 —— 已结束
    title: '期中复习经验分享会',
    type: 'lecture',
    publisherType: 'personal',
    publisherName: '一位热心的学长',
    audience: '全校',
    startAt: local('2026-11-01T19:00:00'),
    endAt: local('2026-11-01T21:00:00'),
    signupDeadline: local('2026-10-31T23:59:00'),
    description: '分享高数、线代与程序设计三门课的复习方法与真题资料。活动已结束。',
    link: null,
    coverColor: '#6B7280',
  },
  {
    // E10 —— 完全在当前窗口之外（远期）
    title: '春季运动会志愿者招募',
    type: 'recruit',
    publisherType: 'college',
    publisherName: '电子信息学院',
    audience: '全校',
    startAt: local('2027-03-01T08:00:00'),
    endAt: local('2027-03-05T18:00:00'),
    signupDeadline: local('2027-02-20T23:59:00'),
    description: '为春季运动会招募计分、引导与急救志愿者，志愿服务时长可折算第二课堂学分。',
    link: null,
    coverColor: '#16A34A',
  },
  {
    // E11 —— 跨月且与 11 月窗口部分重叠
    title: '数据结构答疑周',
    type: 'lecture',
    publisherType: 'personal',
    publisherName: '匿名同学',
    audience: '2026 级',
    startAt: local('2026-10-15T19:00:00'),
    endAt: local('2026-11-15T21:00:00'),
    signupDeadline: local('2026-11-14T23:59:00'),
    description: '每天晚上线上答疑一小时，覆盖树、图、排序与动态规划。',
    link: null,
    coverColor: '#9333EA',
  },
  {
    // E12 —— 同日多活动（A）
    title: 'Linux 运维入门实操',
    type: 'club',
    publisherType: 'org',
    publisherName: '运维技术社团',
    audience: '全校',
    startAt: local('2026-11-18T14:00:00'),
    endAt: local('2026-11-18T17:00:00'),
    signupDeadline: local('2026-11-17T23:59:00'),
    description: '从命令行基础到 systemd 服务管理，现场用虚拟机演示一次完整的服务部署。',
    link: null,
    coverColor: '#EA580C',
  },
  {
    // E12 —— 同日多活动（B）
    title: 'AI 辅助编程边界讨论会',
    type: 'lecture',
    publisherType: 'college',
    publisherName: '计算机学院',
    audience: '全校',
    startAt: local('2026-11-18T16:00:00'),
    endAt: local('2026-11-18T18:00:00'),
    signupDeadline: local('2026-11-18T12:00:00'),
    description: '讨论在课程作业与竞赛中使用 AI 工具的边界，以及如何验证生成内容。',
    link: null,
    coverColor: '#4F46E5',
  },
  {
    // E14 —— 报名截止与活动开始在同一天
    title: '一分钟简历诊断',
    type: 'other',
    publisherType: 'personal',
    publisherName: '就业互助小组',
    audience: '全校',
    startAt: local('2026-11-22T09:00:00'),
    endAt: local('2026-11-22T18:00:00'),
    signupDeadline: local('2026-11-22T08:00:00'),
    description: '当天上午开始，但报名截止在当天上午 8 点。一对一简历点评，每人 15 分钟。',
    link: null,
    coverColor: '#0D9488',
  },
];

/** 评论（挂在第一个活动上） */
const COMMENTS = [
  { activityIndex: 0, nickname: '小林', content: '报名要提交一份往届题目说明，截止前一天系统很卡，建议早点交。' },
  { activityIndex: 0, nickname: '路过的大二', content: '去年初赛有三道图论，最后一题是大模拟，注意时间分配。' },
  { activityIndex: 0, nickname: '参赛选手', content: '现场有电源，但网线要自己带，记得准备转接头。' },
  { activityIndex: 7, nickname: '阿哲', content: '滚动报名很友好，我第二周才加入也能跟上。' },
];

/**
 * 写入种子数据。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{reset?:boolean}} [opts]
 */
export function seed(db, { reset = false } = {}) {
  if (reset) {
    db.exec('DELETE FROM comments;');
    db.exec('DELETE FROM activities;');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('activities','comments');");
  }

  const existing = Number(db.prepare('SELECT COUNT(*) AS n FROM activities').get().n);
  if (existing > 0) {
    return { inserted: 0, skipped: true, existing };
  }

  const ts = new Date().toISOString();
  const insertActivity = db.prepare(
    `INSERT INTO activities
       (title, type, publisher_type, publisher_name, audience,
        start_at, end_at, signup_deadline, description, link, cover_color,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertComment = db.prepare(
    'INSERT INTO comments (activity_id, nickname, content, created_at) VALUES (?,?,?,?)',
  );

  const ids = [];
  for (const a of ACTIVITIES) {
    const info = insertActivity.run(
      a.title,
      a.type,
      a.publisherType,
      a.publisherName,
      a.audience,
      a.startAt,
      a.endAt,
      a.signupDeadline,
      a.description,
      a.link ?? null,
      a.coverColor ?? null,
      ts,
      ts,
    );
    ids.push(Number(info.lastInsertRowid));
  }

  for (const c of COMMENTS) {
    insertComment.run(ids[c.activityIndex], c.nickname, c.content, ts);
  }

  return { inserted: ids.length, comments: COMMENTS.length, skipped: false };
}

// ---- CLI 入口 ----
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('seed.js')) {
  const reset = process.argv.includes('--reset');
  const db = openDatabase();
  try {
    const result = seed(db, { reset });
    if (result.skipped) {
      console.log(`跳过：已有 ${result.existing} 条活动。如需重建请执行 npm run seed -- --reset`);
    } else {
      console.log(`已写入 ${result.inserted} 条活动、${result.comments} 条评论。`);
    }
  } finally {
    closeDatabase(db);
  }
}
