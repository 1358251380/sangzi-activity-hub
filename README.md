# 桑梓 · 校园活动聚合与时间轴系统

[![CI](https://github.com/1358251380/sangzi-activity-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/1358251380/sangzi-activity-hub/actions/workflows/ci.yml)

> 桑梓实验室 2026 纳新项目 · **运维方向**
> 把分散在公众号、QQ 群、微信群里的校园活动信息聚合到一处，**以时间为主轴**呈现，并允许同学在活动下沉淀报名经验。

![活动浏览](docs/screenshots/home.png)

---

## 1. 项目目标

学院、学生组织和同学个人都在发布活动信息，但信息散落在公众号、QQ 群和微信群里。想知道一个活动哪天开始、哪天截止报名、要注意什么，往往要翻好几个地方。

本项目把这些信息集中起来：

- **聚合**：三类发布者（学院 / 学生组织 / 个人）的信息进入同一个池子
- **按时间查看**：横向时间轴同时表达「活动持续区间」与「报名截止时刻」两件不同的事
- **交流**：活动详情下可以补充报名经验、材料要求、注意事项

> 页面中的所有数据均为**自编示例数据**，不含任何真实同学信息。

---

## 2. 功能

### 2.1 浏览与发现

| 能力 | 说明 |
|---|---|
| 活动列表 | 卡片展示名称、类型、发布者、开始 / 结束时间、报名截止；发布者类型有独立配色徽标，一眼区分**学院 / 学生组织 / 个人** |
| 搜索 | 关键词同时匹配标题与介绍正文 |
| 筛选 | 活动类型、发布者类型、面向对象，条件可叠加、可一键清空 |
| 排序 | 按开始时间 / 报名截止 / 发布时间 |
| 活动详情 | 完整介绍、参与方式与外链、报名截止倒计时、评论区 |

### 2.2 时间轴

核心视图。一个活动在同一屏上同时表达两件不同的事：

- **活动区间** → 横向圆角色条，长度与持续天数成正比，跨天跨度直观可见
- **报名截止** → 琥珀色菱形 + 虚线标记，形状与色条刻意区分，不会被误读成同一件事

配套能力：周 / 月 / 季三种时间窗口、今天基准线、按窗口长度自适应的刻度、图例、以及被窗口裁剪时的 `« »` 箭头提示。

几何计算全部收敛在 `web/src/lib/timeline.js` 的纯函数里，因此跨月、跨年、窗口裁剪、单日活动塌缩等边界都能离线单测。设计说明见 [docs/03](docs/03-时间轴设计说明.md)。

### 2.3 发布与维护

- 完整发布表单：名称、类型、发布者类型与名称、面向对象、开始 / 结束 / 报名截止、介绍、相关链接
- **三层校验**：前端即时提示 → 服务端 422 逐字段中文错误 → 数据库 CHECK 约束兜底
- 发布时直接选择身份，无需注册账号
- 「我的发布」可编辑 / 删除自己发布的活动（权限边界用浏览器本地记录实现）

### 2.4 交流

活动详情页下方是评论区，用于补充报名经验、材料要求与注意事项。评论含昵称、内容、发表时间，内容非空校验，发表后即时显示。

### 2.5 数据与可靠性

- SQLite 单文件持久化，刷新、重启服务、重启机器数据都在
- 所有写操作都有明确成功 / 失败提示
- 顶部导航常驻，PC 与 375px 手机宽度均可正常使用
- 服务端具备：健康检查（liveness / readiness 分层）、结构化日志与 requestId 追踪、优雅退出、统一错误结构、在线热备与恢复演练
- 防护：应用层限流兜底（探针豁免）、可选的 Prometheus `/metrics`；容器侧只读根文件系统、资源上限、禁止提权

### 2.6 不做的事

真实账号鉴权、对接学校系统、真实通知推送、收集报名名单、公网部署。

这些会显著增加复杂度，但对本项目真正要解决的问题（信息聚合、按时间查看、经验交流）没有实质提升；而且涉及真实个人信息，不适合在示例项目中实现。

---

## 3. 技术方案

```
web/     React 19 + Vite 6 + 原生 CSS（设计令牌）   ← 前端 SPA
   │  HTTP  /api/*  (JSON)  ·  开发期 Vite proxy
server/  Node 24 + Express 5 + node:sqlite          ← 后端 API
   │
data/app.db                                          SQLite 单文件
```

### 关键选型与理由

| 选择 | 理由 |
|---|---|
| **前后端分离** | 前端只负责渲染与交互，业务规则与数据全部收在 REST 接口后面。这样校验、状态派生、查询都能脱离 UI 单独测试，也便于将来替换任一端的实现 |
| **SQLite 而非 MySQL/PostgreSQL** | 单文件、零运维，clone 下来直接能跑，不需要额外装数据库服务。数据量级与并发特征（读多写少）也完全够用；写入瓶颈与迁移路径已单独分析（见 [docs/12](docs/12-容量基线与压测.md)） |
| **`node:sqlite` 而非 better-sqlite3** | Node 24 内置模块，**免原生编译**。Windows 上不会因为 node-gyp / VS Build Tools 缺失而安装失败 |
| **Express 5** | 生态最稳、代码量最小，路由与中间件模型一眼能看懂 |
| **不用 TypeScript** | 不需要构建步骤来证明工程能力。**零构建 = `node src/index.js` 直接跑**，少一种"跑不起来"的失败模式；类型用 JSDoc 表达 |
| **React + Vite** | 时间轴这类富交互用声明式渲染成本最低；构建产物由后端单端口托管，生产环境只需一个进程 |
| **原生 CSS + 设计令牌** | 不引 UI 框架：包体小、样式完全可控、不做成"套模板"的观感，且 `tokens.css` 本身就是一份视觉规范 |

### 两个核心设计决策

**① 活动状态不落库，由时间派生**

状态完全由 `startAt / endAt / signupDeadline` 与当前时间决定。落库必然随时间推移与实际不一致，而时间轴、倒计时、筛选全都依赖它。同时把状态拆成两个正交维度：

- `status`：生命周期（报名中 / 报名已截止 / 进行中 / 已结束）
- `signupOpen`：能否报名

这样才能表达「**活动已开始，但报名还没截止**」这种合法情况——单一枚举表达不了。

**② 时间轴 = 连续时间坐标，不是月历格子**

用一个 `ratio(t) = (t - W0) / (W1 - W0)` 的线性映射，同时得到色条的 `left/width`（区间）和截止标记的 `left`（时刻）。因为共用同一坐标系，两者永远对齐；且**跨月、跨年自动正确**，不需要按月切格。

所有几何计算集中在纯函数 `web/src/lib/timeline.js`，与渲染解耦，因此边界情况（裁剪、除零、单日塌缩）都能离线单测。

详见 [docs/03-时间轴设计说明.md](docs/03-时间轴设计说明.md)

---

## 4. 快速启动

### 环境要求

- **Node.js ≥ 22.5.0**（需要内置 `node:sqlite`；本项目在 v24.15.0 上验证）
- 不需要数据库服务、不需要 Docker（Docker 为可选的第三种启动方式）

### 三步启动

```bash
# 1. 安装依赖（后端 + 前端）
npm run setup

# 2. 写入示例数据（14 条活动，覆盖各种时间边界场景）
npm run seed

# 3. 构建前端并启动（单端口 3001）
npm run build
npm start
```

打开 **http://localhost:3001** 即可。

### 三种运行方式

| 方式 | 命令 | 说明 | 验证状态 |
|---|---|---|---|
| **开发模式** | `npm run dev` | 后端 3001 + 前端 5173（热更新），Vite 代理 `/api` | ✅ 已验证 |
| **生产模式** | `npm run build && npm start` | 单端口 3001 同时托管 API 与前端产物 | ✅ 已验证 |
| **容器（含反代）** | `npm run cert` → `docker compose -f deploy/docker-compose.yml up -d --build` | Nginx 网关 + 应用容器，数据挂卷 | ✅ 已验证（healthy / TLS / 限流 / 数据持久化） |

**容器方式说明**（入口：`http://localhost:8080`，HTTPS：`https://localhost:8443`）

1. 首次启动前生成自签证书：`npm run cert`
   （需要 `openssl`；Windows 上通常随 Git for Windows 提供。Linux/macOS 用 `bash scripts/gen-cert.sh`）
2. `docker compose -f deploy/docker-compose.yml up -d --build`
3. 拓扑：`浏览器 → nginx(8080/8443) → app:3001`。**应用容器不发布端口**，只能经网关访问

| 能力 | 由谁提供 |
|---|---|
| TLS 终止、gzip、限流（20 r/s + burst 40）、安全响应头、`/healthz` | Nginx |
| 业务 API、前端产物、liveness / readiness 探针 | app 容器 |

Windows 用户也可以直接用脚本：`scripts\setup.ps1` → `scripts\start.ps1`

### 环境变量

复制 `.env.example` 为 `.env`（可选，不建也能跑）。

**启动即校验（fail-fast）**：配置非法时服务会直接退出并列出全部错误，不会带着错配置对外服务。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3001` | 后端监听端口（1–65535，非法则启动失败） |
| `HOST` | `0.0.0.0` | 监听地址；容器内必须是 `0.0.0.0` |
| `DB_PATH` | `./data/app.db` | SQLite 文件路径，相对项目根目录解析 |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `LOG_FORMAT` | 生产 `json` / 其它 `text` | 日志格式：JSON 便于采集，text 便于人读 |
| `TRUST_PROXY` | `1` | 放在反向代理后面时保持 `1`，以正确识别客户端 IP |
| `CORS_ORIGIN` | `http://localhost:5173` | 仅开发期需要；生产同源无需跨域 |
| `RATE_LIMIT_MAX` | `120` | 应用层限流：窗口内允许的请求数，`0` 表示关闭 |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口长度（毫秒，不小于 1000） |
| `METRICS_ENABLED` | `false` | 是否暴露 Prometheus `/metrics`（默认关闭，避免泄露接口结构） |
| `BACKUP_DIR` / `BACKUP_KEEP` | `./data/backups` / `7` | 仅备份脚本使用 |

### 运维命令

```bash
npm run backup        # 在线热备（VACUUM INTO），自动校验 + 保留最近 7 份
npm run backup:drill  # 恢复演练：临时目录里删库再还原，验证备份真的可用
npm run cert          # 生成 Nginx 用的自签 TLS 证书（仅容器方式需要）
```

压测（零依赖，可测任意端点）：

```bash
node scripts/loadtest.mjs 'http://127.0.0.1:8080/api/activities?pageSize=20' --duration=8 --concurrency=10
```

实测容量基线与瓶颈分析见 [docs/12-容量基线与压测.md](docs/12-容量基线与压测.md)。

备份产物在 `data/backups/`（已 gitignore）。为什么不能直接复制 `app.db`、以及真实故障时怎么恢复，见 [docs/04 §9](docs/04-部署与质量方案.md)。

---

## 5. 目录结构

```
.
├─ README.md
├─ package.json              # 统一脚本入口
├─ .env.example
├─ docs/                     # 设计文档（同时是运维方向选交材料）
│  ├─ 00-总体方案与架构.md
│  ├─ 01-需求与功能清单.md
│  ├─ 02-数据模型与接口设计.md
│  ├─ 03-时间轴设计说明.md
│  ├─ 04-部署与质量方案.md
│  ├─ 05-测试记录.md
│  ├─ 06-问题排查记录.md
│  ├─ 07-AI使用记录.md
│  ├─ 08-环境安装清单.md
│  ├─ 11-Docker安装完成说明.md
│  ├─ 12-容量基线与压测.md
│  ├─ 13-Runbook.md            # 运维手册：启停 / 回滚 / 排障 / 巡检
│  ├─ 14-后续优化路线图.md
│  └─ screenshots/
├─ server/                   # 后端
│  ├─ src/
│  │  ├─ index.js            # 入口：配置、监听、优雅退出
│  │  ├─ app.js              # Express 装配（可被测试直接引用）
│  │  ├─ db.js               # 连接 + 迁移 + 路径解析
│  │  ├─ schema.sql          # DDL 单一事实来源
│  │  ├─ seed.js             # 示例数据
│  │  ├─ routes/             # activities / meta(health,options,timeline)
│  │  ├─ lib/                # repository / validate / status（纯函数）
│  │  └─ middleware/         # logger / errors
│  └─ test/                  # status / validate / api
├─ web/                      # 前端
│  ├─ src/
│  │  ├─ pages/              # Browse / TimelinePage / Detail / Publish / Manage
│  │  ├─ components/         # ActivityCard / TimelineChart / Comments / ...
│  │  ├─ lib/                # timeline.js（核心算法）/ time.js / labels.js
│  │  ├─ api/client.js
│  │  └─ styles/             # tokens.css（设计令牌）/ base.css
│  └─ dist/                  # 构建产物（不提交）
├─ scripts/                  # dev / verify / setup / start / test
├─ deploy/                   # Dockerfile / docker-compose.yml
└─ .github/workflows/ci.yml
```

---

## 6. 接口一览

Base：`/api`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（DB 不可用返回 503） |
| GET | `/api/meta/options` | 枚举字典 |
| GET | `/api/activities` | 列表 + 搜索 + 筛选 + 分页 |
| GET | `/api/activities/:id` | 详情 |
| POST | `/api/activities` | 发布 |
| PATCH | `/api/activities/:id` | 编辑 |
| DELETE | `/api/activities/:id` | 删除（评论级联删除） |
| GET | `/api/activities/:id/comments` | 评论列表 |
| POST | `/api/activities/:id/comments` | 发表评论 |
| GET | `/api/timeline?from=&to=` | 时间窗口内活动 |

统一错误结构：

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "表单校验未通过",
             "fields": { "endAt": "结束时间不能早于开始时间" } } }
```

完整规格见 [docs/02-数据模型与接口设计.md](docs/02-数据模型与接口设计.md)

---

## 7. 时间轴

![时间轴](docs/screenshots/timeline.png)

一个活动在同一视图上表达两件事：

- **活动区间** → 圆角色条，宽度与持续天数成正比；被窗口裁剪时两端显示 `« »`
- **报名截止** → 琥珀色菱形 + 虚线，形状与色条刻意不同，不会被误读为同一件事

左边色条配色代表状态（报名中 / 报名已截止 / 进行中 / 已结束），红色竖线是"今天"。
标注了「跨窗口 N」的活动表示它的时间超出当前视图。

以一个典型的多日竞赛为例：**10-20 截止报名，11-15 至 16 举行**。在时间轴上，这两件事同时可读——短色条表示两天的比赛，左侧菱形标记表示报名截止。该场景有专门的单元测试（`E1`）固定住预期。

---

## 8. 测试

```bash
npm test        # 后端测试（status / validate / api）
npm run verify  # 后端 + 前端 + 构建产物 + 数据库 全量自检
```

| 测试文件 | 数量 | 覆盖 |
|---|---|---|
| `server/test/config.test.js` | 17 | 配置 fail-fast：PORT / NODE_ENV / DB_PATH / LOG_FORMAT / TRUST_PROXY / CORS 校验 |
| `server/test/status.test.js` | 14 | 四态派生、边界时刻、正交状态、非法输入 |
| `server/test/validate.test.js` | 20 | 必填/长度/枚举/时间关系/链接协议/查询参数降级 |
| `server/test/api.test.js` | 31 | 真实起 HTTP 服务，覆盖 P0 全链路 + 安全头 |
| `server/test/serving.test.js` | 14 | requestId 透传/生成、错误体一致性、缓存分层、gzip 压缩 |
| `server/test/health.test.js` | 5 | liveness / readiness 分层：DB 挂掉时 live 仍 200、ready 503 |
| `server/test/rate-limit.test.js` | 7 | 应用层限流：429 / Retry-After / 分 IP 独立计数 / 探针豁免 |
| `server/test/metrics.test.js` | 8 | Prometheus 指标：默认关闭、文本格式合法、计数与直方图累加 |
| `web/src/lib/timeline.test.js` | 14 | 坐标线性性、裁剪、跨月、除零、排序、刻度自适应 |
| `web/src/lib/time.test.js` | 23 | 日期格式化、区间压缩、时长取整、截止倒计时、表单值互转 |
| `web/src/api/client.test.js` | 15 | 查询串拼装、请求方法、422/404/网络异常 → ApiError 映射 |
| `web/src/lib/myPublish.test.js` | 11 | localStorage 增删查、去重、脏数据与不可写场景的降级 |
| **合计** | **179** | |

详细结果见 [docs/05-测试记录.md](docs/05-测试记录.md)

---

## 9. 已知问题

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | 无公网演示地址 | 只能本地运行 | 按第 4 节启动即可；容器方式一条命令拉起 |
| 2 | 时间轴在窄屏下需横向滚动 | 375px 下时间轴画布（470px）超出视口，需左右滑动查看完整跨度 | 已在 375px 视口验证：页面本身无横向溢出，只有时间轴区域可横向滚动；列表/详情/发布页完全自适应。截图见 [mobile-timeline.png](docs/screenshots/mobile-timeline.png) |
| 3 | 无账号体系 | 编辑 / 删除权限边界依赖浏览器 localStorage | 有意简化：发布时直接选择身份；「我的发布」用本地记录划定范围，避免任意删除他人活动 |
| 4 | 表单仅在顶层给出错误摘要 + 字段旁红字，未逐字段做 `aria-describedby` 关联 | 读屏用户需先听摘要，再定位到具体字段 | 已用表单级 `role="alert"` 摘要覆盖主要场景；逐字段关联列为后续改进 |
| 5 | 容器界面语言为英文 | Docker Desktop 无中文语言包 | 仅为使用体验问题，不影响功能；设置项按英文对照即可 |

---

## 10. AI 工具与开源资料使用说明

本项目在需求分析、架构设计、代码实现、调试排错、文档撰写过程中使用了 AI 编程工具辅助。**所有生成内容均经过逐项验证**（单元测试、真实启动、生产模式接口探测、浏览器渲染截图），核心设计与取舍由本人确认。

- 使用了哪些 AI 工具、分别用在哪里：[docs/07-AI使用记录.md](docs/07-AI使用记录.md)
- 第三方依赖：`express`、`react`、`react-dom`、`react-router-dom`、`dayjs`、`vite`、`@vitejs/plugin-react`（均见各 `package.json`）
- 未复制任何他人的完整项目；示例数据全部自编
