# 13 · 运维手册（Runbook）

> 面向「接手这台服务的人」：怎么起、怎么停、怎么回滚、怎么排障、巡检看什么。
> 所有命令都经过实测，可直接复制。

---

## 1. 服务拓扑

```
                 ┌──────────────┐
浏览器 ──8080──► │  nginx       │ ──► app:3001 ──► SQLite (/app/data/app.db)
        ──8443──► │  (TLS/限流)  │                    │
                 └──────────────┘                    └── 命名卷 sangzi-app-data
```

| 组件 | 容器名 | 端口 | 说明 |
|---|---|---|---|
| 网关 | `sangzi-gateway` | 宿主机 8080（HTTP）/ 8443（HTTPS） | Nginx，唯一对外入口 |
| 应用 | `sangzi-app` | 仅内网 3001 | Node + Express，不对外发布端口 |

**本地直跑模式**（不用容器）：`npm run build && npm start` → 单端口 3001，无网关。

---

## 2. 启停

### 容器方式

```bash
# 首次或证书缺失时先生成自签证书
npm run cert

# 启动 / 更新（代码改了也用它，会重建镜像）
docker compose -f deploy/docker-compose.yml up -d --build

# 仅重启（不重建镜像）
docker compose -f deploy/docker-compose.yml restart

# 停止（保留容器与卷）
docker compose -f deploy/docker-compose.yml stop

# 停止并删除容器（**数据保留**在命名卷）
docker compose -f deploy/docker-compose.yml down

# 停止并删除容器 + 卷（⚠️ 数据全丢，仅用于彻底重置）
docker compose -f deploy/docker-compose.yml down -v
```

### 本地方式

```bash
npm run build      # 构建前端产物到 web/dist
npm start          # 生产模式，单端口 3001
```

---

## 3. 健康检查

| 端点 | 用途 | 期望 |
|---|---|---|
| `GET /api/health/live` | 进程是否活着（不查库） | 永远 200 |
| `GET /api/health/ready` | 能否对外服务（查库） | 200；库不可用时 **503** |
| `GET /api/health` | 聚合视图（含 uptime / version） | 200 |
| `GET /healthz`（网关） | Nginx 自身，不碰后端 | 200 `ok` |

```bash
# 一条命令看全部
curl -s localhost:8080/api/health | jq .
docker compose -f deploy/docker-compose.yml ps      # 关注 (healthy)
```

> **探针语义**：`live` 失败 → 容器该重启；`ready` 失败 → 该摘流量但**不要重启**（数据库抖动重启会放大故障）。

---

## 4. 看日志

```bash
# 应用日志（JSON 行，含 reqId）
docker compose -f deploy/docker-compose.yml logs -f --tail=100 app

# 网关访问日志（JSON 行，含同一个 reqId）
docker compose -f deploy/docker-compose.yml logs -f --tail=100 nginx

# 只看错误
docker compose -f deploy/docker-compose.yml logs app | grep '"lvl":"ERROR"'
```

**按 requestId 追一次请求**（跨两层）：

```bash
RID=xxxx
docker compose -f deploy/docker-compose.yml logs nginx | grep "$RID"
docker compose -f deploy/docker-compose.yml logs app   | grep "$RID"
```

用户报错时，让他提供响应头 `X-Request-Id` 或错误体里的 `requestId`，即可定位。

---

## 5. 更新与回滚

### 更新（新版本上线）

```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps        # 等 healthy
curl -s localhost:8080/api/health                     # 确认 db=ok
```

预计中断：容器重建期间约 5–15 秒（当前为单实例，**不是零停机**）。

### 回滚

```bash
# 代码回滚
git log --oneline -5
git revert <bad-commit>          # 或 git reset --hard <good-commit>
docker compose -f deploy/docker-compose.yml up -d --build

# 镜像层回滚（若保留旧 tag）
docker tag sangzi-activity-hub:1.0.0 sangzi-activity-hub:broken
docker compose -f deploy/docker-compose.yml up -d
```

> 当前没有多实例与滚动更新，回滚同样会有秒级中断。要做到零停机需要「双实例 + Nginx upstream」，且必须先把 SQLite 换成 PostgreSQL（单写者模型不支持多实例并发写）。

---

## 6. 备份与恢复

```bash
npm run backup        # 在线热备（VACUUM INTO）+ 完整性校验 + 保留最近 7 份
npm run backup:drill  # 恢复演练：临时目录删库再还原，验证备份真的可用
```

产物：`data/backups/app-YYYYMMDD-HHMMSS.db`

**恢复步骤**（故障时照做）：

```bash
# 1. 停服务（避免写入）
docker compose -f deploy/docker-compose.yml stop app

# 2. 备份当前坏库（万一还要捞数据）
cp data/app.db data/app.db.broken.$(date +%s) 2>/dev/null || true

# 3. 用目标备份覆盖，并清掉 WAL 残留
cp data/backups/app-<时间>.db data/app.db
rm -f data/app.db-wal data/app.db-shm

# 4. 起服务并验证
docker compose -f deploy/docker-compose.yml start app
curl -s localhost:8080/api/health
curl -s "localhost:8080/api/activities?pageSize=1"     # 看总数是否符合预期
```

> **为什么不能直接 `cp app.db` 做备份**：开了 WAL，最新写入可能还在 `-wal` 里，裸拷会得到不一致快照。必须用 `VACUUM INTO`（`npm run backup` 已封装）。

---

## 7. 故障排查速查

| 症状 | 先查什么 | 常见原因 / 处理 |
|---|---|---|
| 网关起不来，反复 Restarting | `docker logs sangzi-gateway` | 证书缺失 → `npm run cert`；改过 nginx 配置后需 `--force-recreate` |
| 页面 502 Bad Gateway | `docker ps` 看 app 是否 healthy；`docker logs app` | app 未就绪 / 崩溃；看 readiness 是否 503（数据库问题） |
| `ready` 返回 503 但进程在 | `docker logs app` 里是否有 SQLite 报错 | 数据卷权限、磁盘满、库文件损坏 |
| 大量 429 | 看是网关还是应用返回 | 网关：`limit_req`；应用：`RATE_LIMIT_MAX`。确认不是攻击后调阈值 |
| 接口慢 | `docker compose logs app \| grep ms` 看耗时；`/metrics` 看 P95 | 数据量增大 / 无索引；参考 [docs/12](12-容量基线与压测.md) 的容量基线 |
| 启动报「配置校验失败」 | 看退出信息里列出的字段 | fail-fast：按提示修正环境变量（`PORT`/`NODE_ENV`/`DB_PATH` 等） |
| 端口被占用 | `netstat -ano \| findstr :8080` | 改 `docker-compose.yml` 端口映射，或停掉占用进程 |
| CI 变红 | Actions 日志 | 测试失败 / 依赖漏洞告警（`npm audit`）；按日志修 |
| 磁盘涨得快 | `docker system df` | 镜像/日志堆积 → `docker image prune`、确认日志轮转已生效（10m×3） |

---

## 8. 日常巡检清单

每天（或每次发布前后）花 2 分钟：

```bash
# 1. 容器健康
docker compose -f deploy/docker-compose.yml ps

# 2. 接口健康
curl -s localhost:8080/api/health

# 3. 错误日志（近 100 行）
docker compose -f deploy/docker-compose.yml logs --tail=100 app | grep -c '"lvl":"ERROR"'

# 4. 磁盘
docker system df

# 5. 备份是否在生成（看最新文件名是否为今天）
ls -lt data/backups | head -3
```

| 检查项 | 阈值 / 期望 |
|---|---|
| 容器状态 | 两个都是 `healthy` |
| `/api/health` | `status=ok`、`db=ok` |
| ERROR 日志 | 近 100 行里为 0（偶发可接受，持续增长需查） |
| 备份 | 最近一份不超过 24 小时 |
| 磁盘 | 根分区剩余 > 10% |

---

## 9. 关键配置项

| 变量 | 默认 | 说明 | 改错会怎样 |
|---|---|---|---|
| `PORT` | 3001 | 监听端口 | 1–65535，非法则**启动失败** |
| `HOST` | 0.0.0.0 | 监听地址 | 容器内必须是 0.0.0.0 |
| `DB_PATH` | `./data/app.db` | SQLite 路径（相对项目根解析） | 指向不存在目录会导致启动失败 |
| `NODE_ENV` | development | 仅 `development`/`production`/`test` | 写 `prod` 会**启动失败**（这是故意的） |
| `LOG_FORMAT` | 生产 json / 其它 text | 日志格式 | 非法值启动失败 |
| `TRUST_PROXY` | 1 | 反代后的真实 IP 识别 | 设 0 会拿到反代 IP，限流会误伤所有人 |
| `RATE_LIMIT_MAX` | 120 | 应用层限流阈值（0 关闭） | 过小会误伤正常用户 |
| `RATE_LIMIT_WINDOW_MS` | 60000 | 限流窗口 | 小于 1000 会启动失败 |
| `METRICS_ENABLED` | false | 是否暴露 `/metrics` | 打开后指标对外可见，注意网络边界 |

---

## 10. 已知边界（别在这上面浪费时间）

| 项 | 现状 |
|---|---|
| 高可用 | 单实例，重启/更新有秒级中断 |
| 多实例扩展 | SQLite 单写者，**不能**简单地起多个 app 副本 |
| 写入吞吐 | 约 326 req/s（单机基线），瓶颈在 SQLite 串行写 |
| 前置条件 | 容器方式需要先生成 TLS 证书；本地方式不需要 |
| 观测 | 有 JSON 日志 + 可选 `/metrics`，但**没有**接入 Prometheus/Grafana 与告警 |
