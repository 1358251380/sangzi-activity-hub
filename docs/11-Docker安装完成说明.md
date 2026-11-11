# Docker 安装与容器化验证说明

> **状态：已完成** —— 容器化全量验证已通过（2026-11-11）。
> **已验证结论**：`docker compose up -d --build` 构建 30 秒 → 容器 `healthy` → `/api/health` 返回 `db=ok` → 写入记录后 `restart`，**总数仍为 15、记录仍在**（命名卷 `sangzi-app-data → /app/data` 生效）。完整步骤与输出见 [docs/04 §5.2](04-部署与质量方案.md) 与 [docs/05 §6](05-测试记录.md)。
> **本文定位**：记录「Docker Desktop 如何在本机装通、为何装在 E 盘」的环境侧过程，作为部署文档的素材保留。
> **生成时间**：2026-11-11 15:40（环境数据为本会话实测）｜验证结果由项目对话补写
> **对应项目**：`D:\作品\工作台\桑梓项目`
> **注**：早期的 `docs/10-Docker安装交接说明.md` 已删除（其结论已被推翻，见 [docs/06 §P14](06-问题排查记录.md) 的后续修正）。

---

## 0. 一句话结论

**Docker Desktop 4.99.0 已装通并可用**：引擎 29.9.3（linux 容器）、Compose v5.7.0、`hello-world` 输出 `Hello from Docker!`、`node:24-alpine`（项目 Dockerfile 的基础镜像）已成功拉取。程序装在 `E:\linux\Docker`，数据落在 `E:\linux\DockerData`。**项目 compose 的全量业务验证尚未做**，那一步留给项目对话（脚本已备好，见 §6）。

---

## 1. 之前卡在哪、后来怎么解决的（纠正 docs/10 的判断）

docs/10 的判断是「组件库大面积损坏，必须用 5.9 GB 的 25H2 ISO 修复」。**实测证明不需要 ISO**，真实原因是两件事叠加：

| 时间 | 事件 | 证据来源 |
|---|---|---|
| 11-10 18:07 | `Enable-Feature VirtualMachinePlatform` 报 `0x80073712` | `C:\Windows\Logs\DISM\dism.log` |
| 同上 | 真触发点是 `vmwp.exe.mui`（Hyper-V VMWP 的 zh-CN 资源）压缩态异常：磁盘 88,576 B 未压缩，组件清单要求 LZMS 压缩 | `C:\Windows\Logs\CBS\CBS.log`：`Unexpected compression state ... CompressedFileType is 0, ComponentFileFlags : LZMS: 3` |
| 11-10 18:44 | `C:\Windows\WinSxS\pending.xml` 出现：WSL MSI 装好后**从未重启**，遗留 CBS 挂起事务（`Microsoft-Windows-Lxss-merged-Deployment` + `dual_wvms` 驱动） | `pending.xml` 183 KB；`CBS RebootPending=True` |
| 11-10 19:24 | 不带 `/Source` 的 `RestoreHealth` 报 `0x800f0915`（WU 无修复内容） | CBS：`CSI Payload Corruption: 1`，`Could not find component missing payload ... smbwmiv2.mfl` |
| 11-11 12:44 | **重启后** 挂起事务正常收尾（`Lxss-merged-Package → Installed`） | CBS：`Startup: Package ... completed startup processing` |
| 11-11 12:51 | 提权重跑 `Enable-Feature`，**两个功能均返回 `0x0 (S_OK)`**；`0x80073712` 未再出现 | DISM：`overall result:0x0 (S_OK)`，`Reboot required: True`（DRIVERSPRESENT） |
| 11-11 15:0x | 重启后 `vmcompute` 服务出现，`hello-world` 可运行 | `Get-Service vmcompute`；`docker run --rm hello-world` |

**结论**：卡点是「装完 WSL MSI 后未重启」导致的事务无法合并；单个损坏的 `vmwp.exe.mui` 被 10.0.26100.9711 新版组件取代而自然绕过。**没有下载任何 ISO，节省 5.9 GB。**

---

## 2. 为什么最后装在 E 盘（以及踩过的坑）

默认位置（本次迁移前实测）：

| 内容 | 默认位置 | 大小 |
|---|---|---|
| 程序 | `C:\Program Files\Docker\Docker` | 3,992 MB |
| 数据（WSL vhdx） | `C:\Users\onuij\AppData\Local\Docker\wsl\...` | 1,580 MB |
| 合计 | C: | ≈ 5.5 GB（C: 只剩 17 GB） |

迁移方式：**卸载 → 用安装器参数重装**（Docker 官方文档明确：切换安装模式/路径必须卸载重装）。

- 第一次重装失败：`installer exit code = -5`。日志原文（`C:\ProgramData\DockerDesktop\install-log-admin.txt`）：
  > `The data root 'E:\linux\Docker\data' (--wsl-default-data-root) is inside the installation directory 'E:\linux\Docker'... Updating would delete all Docker data stored there.`
  → **数据目录不能放在安装目录内部**。
- 第二次改为同级分离，成功：
  ```
  install --quiet --accept-license --backend=wsl-2 --always-run-service
          --installation-dir=E:\linux\Docker
          --wsl-default-data-root=E:\linux\DockerData
  ```
- 参数依据：[Install Docker Desktop on Windows（官方文档）](https://docs.docker.com/desktop/setup/install/windows-install/#installer-flags)。

**注意**：`C:\Program Files\Docker\cli-plugins`（686 MB，16 个 CLI 插件）是 All-users 安装的固定路径，**不随 `--installation-dir` 迁移**，属正常设计，不要手动删。

---

## 3. 当前环境现状（实测）

| 项 | 值 |
|---|---|
| Docker Desktop | 4.99.0（安装包 `E:\linux\DockerDesktopInstaller.exe`，签名 Docker Inc 有效） |
| Docker Engine | **29.9.3**，`OS=linux`，`DockerRootDir=/var/lib/docker` |
| Docker Compose | **v5.7.0** |
| 程序目录 | `E:\linux\Docker`（3,306 MB） |
| 数据目录 | `E:\linux\DockerData`（`disk\docker_data.vhdx` **1.53 GB** + `main\ext4.vhdx` 0.09 GB） |
| 服务 | `com.docker.service` = Running / Automatic |
| 用户组 | 当前用户已在 `docker-users` |
| 盘符余量 | C: 21.1 GB ｜ D: 44.2 GB ｜ **E: 256.0 GB** |
| 已拉镜像 | `hello-world:latest`、`node:24-alpine`（62.8 MB 内容 / 244 MB 磁盘） |
| 登录 | 未登录（可不登录使用；本地构建不受影响） |
| 界面语言 | **仅英文**（`frontend\locales` 只有 `en-US.pak`，无中文包） |

---

## 4. 镜像拉取已配好加速（项目对话必须知道）

- 现象：`registry-1.docker.io` **直连超时**；Docker Desktop 默认无代理时 `docker run hello-world` 报
  `dial tcp ... registry-1.docker.io:443: connectex: ... failed to respond`。
- 处理：在 `%USERPROFILE%\.docker\daemon.json` 增加（已生效，`docker info` 的 `RegistryMirrors` 可见）：
  ```json
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://dockerproxy.net"
  ]
  ```
- 三个源实测可达（401/200 均为 registry 正常响应）；原文件备份在 `daemon.json.bak`。
- 备选方案：Clash 在 `127.0.0.1:7897` 运行中，可改用 Docker Desktop → Settings → Resources → Proxies（Manual）。
- 因此 `deploy/Dockerfile` 里的 `node:24-alpine` **已在本地**，首次 build 不会卡在拉取上。

---

## 5. 环境侧验证（本会话）+ 业务侧验证（项目对话补完）

**环境侧（已实测）**

| 检查 | 结果 |
|---|---|
| `docker run --rm hello-world` | ✅ 打印 `Hello from Docker!` |
| `docker pull node:24-alpine` | ✅ `Status: Downloaded newer image` |
| `docker images` | ✅ 两个镜像正常列出 |
| 数据落盘位置 | ✅ vhdx 全部在 `E:\linux\DockerData` |
| Compose 可用 | ✅ `docker compose version` → v5.7.0 |

**业务侧（项目对话补完，2026-11-11 ✅ 全部通过）**

| 检查 | 结果 |
|---|---|
| `docker compose up -d --build` | ✅ 构建 30 秒，镜像 `sangzi-activity-hub:1.0.0` |
| 容器状态 | ✅ `Up (healthy)`，`0.0.0.0:3001->3001/tcp` |
| `/api/health` | ✅ `{"status":"ok","db":"ok"}` |
| 前端托管 | ✅ `/` 200、静态资源 200、`/timeline` SPA 兜底 200、`/api/nope` 404 |
| 写入数据 | ✅ `POST /api/activities` → 201，`id=15` |
| **`restart` 后持久化** | ✅ **总数仍 15，`id=15` 记录仍在** → 卷挂载正确 |
| 日志 | ✅ `[SIGTERM] 正在优雅退出…` → 重启后 `跳过：已有 15 条活动` |

> 因此 README / docs/04 / docs/05 中「Docker 未验证」的表述**已全部改为「已验证」**。

---

## 6. 给项目对话的操作指引

### 6.1 直接可用的一键验证脚本

本会话已写好（**纯 ASCII，规避中文编码坑**）：

```
D:\作品\工作台\桑梓项目\.verify\docker-verify.ps1     # 全流程：构建→healthy→health→写入→重启→持久化
D:\作品\工作台\桑梓项目\.verify\payload.json           # POST 用的中文 JSON 载荷（UTF-8 单独存放）
```

运行方式（**必须在放宽沙箱/普通终端**中执行，见 6.2）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\作品\工作台\桑梓项目\.verify\docker-verify.ps1'
Get-Content 'D:\作品\工作台\桑梓项目\.verify\docker-verify.log' -Encoding UTF8
```

脚本会输出结论行：`=== RESULT helloWorld=... healthy=... health=... create=... totalBefore=... totalAfter=... persisted=... ===`

### 6.2 重要限制：不能在受限 shell 里跑 docker

本会话环境（DSH `/workspace-write` 沙箱）中执行 `docker` 会直接失败：

```
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

**原因**：沙箱禁止访问命名管道（同 docs/10 §7.1）。
**对策**：用 `sandbox_permissions: danger-full-access` 执行，或在**普通 PowerShell 窗口 / Windows Terminal** 里运行（推荐后者，最简单）。

另：Docker Desktop 的 GUI **无法从受限 shell 启动**（`0xc0000142` DLL 初始化失败），必须由用户在开始菜单手动启动。

### 6.3 常用命令

```powershell
$bin = 'E:\linux\Docker\resources\bin'
& "$bin\docker.exe" --version
& "$bin\docker.exe" compose -f 'D:\作品\工作台\桑梓项目\deploy\docker-compose.yml' up -d --build
& "$bin\docker.exe" compose -f 'D:\作品\工作台\桑梓项目\deploy\docker-compose.yml' ps
# 或（新开终端后 PATH 已包含 docker）：
docker compose -f deploy/docker-compose.yml up -d --build
```

验证通过后要更新的文档（与 docs/10 §6 一致）：README 三种运行方式表格、README §9 已知问题、docs/04、docs/05（新增容器场景）、docs/06（记录本次修复）；**删除 `docs/10-Docker安装交接说明.md`**。

---

## 7. 已知注意点

1. **界面英文**：Docker Desktop 无中文语言包，设置项按英文对照（Settings → Resources → Advanced 的 `Disk image location` 就是数据目录）。
2. **C: 只剩 21.1 GB**：Docker 相关已尽量迁 E:；但 CLI 插件 686 MB 固定在 C:。后续镜像增长走 E:，无需担心。
3. **不要手工移动已安装目录**：换路径只能卸载重装（官方口径）；切换安装模式（per-user ↔ all-users）同理。
4. **卸载会删数据**：本次卸载已实测（镜像/数据 vhdx/设置一并清除）。以后卸载前如需保留数据，先 `docker save` 或备份 `E:\linux\DockerData`。
5. **代理 vs 镜像源**：当前用镜像源；若镜像源失效，再切 `127.0.0.1:7897` 代理。
6. **`.verify/` 与 `.download/` 都在 .gitignore**：临时证据不污染提交。

---

## 8. 本会话产生的文件（可直接清理）

| 路径 | 说明 |
|---|---|
| `E:\linux\DockerDesktopInstaller.exe` | 595 MB 安装包，装完可删 |
| `E:\linux\Docker` / `E:\linux\DockerData` | **保留**（程序 + 数据） |
| `.verify\*.ps1 / *.mjs / *.log` | 排查与验证脚本，gitignore 已忽略，保留可复现 |
| `docs\10-Docker安装交接说明.md` | 过时的临时交接，交付前删除 |
| `docs\11-Docker安装完成说明.md` | 本文 |
