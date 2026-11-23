# =============================================================================
# 校园活动聚合系统 · 多阶段构建
#
# 为什么用多阶段：
#   构建前端需要 devDependencies（Vite/React 编译链），但这些在运行时完全用不到。
#   多阶段把构建产物单独拷到最终镜像，最终镜像里只有 Express + 前端静态文件，
#   体积小、攻击面小 —— 这是容器化最基本的卫生习惯。
#
# 构建上下文必须是仓库根目录：
#   docker build -f deploy/Dockerfile -t sangzi:1.0 .
# =============================================================================

# ---------- 阶段 1：构建前端 ----------
FROM node:24-alpine AS web-build

WORKDIR /app/web

# 先只拷依赖清单，让这一层能被 Docker 缓存复用：
# 只要 package.json / lock 没变，改业务代码不会重新装依赖
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY web/ ./
RUN npm run build

# ---------- 阶段 2：运行时 ----------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/app/data/app.db

WORKDIR /app

# 先装后端生产依赖（同样利用层缓存）
COPY server/package.json server/package-lock.json* ./server/
RUN npm --prefix server install --omit=dev --no-audit --no-fund

# 再拷源码与前端产物
COPY server/ ./server/
COPY --from=web-build /app/web/dist ./web/dist

# 非 root 运行：容器内的最小权限原则
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data \
    && chown -R app:app /app
USER app

# SQLite 数据库落在数据卷上（见 docker-compose.yml），容器重建数据不丢
VOLUME ["/app/data"]

EXPOSE 3001

# 健康检查打 readiness，而不是只看端口通不通：
#   /api/health/ready 在数据库不可用时返回 503 → 容器被标记 unhealthy
#   注意：不要用 /api/health/live 做这个探针 —— 它不查库，永远 200，起不到「就绪」判断作用
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 启动前补种子数据；seed 在库非空时会自动跳过，因此可重复执行
CMD ["sh", "-c", "node server/src/seed.js; exec node server/src/index.js"]
