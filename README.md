# 3GLabVault

实验室知识库 + 邮箱系统项目仓库。

## 项目目标

本项目面向 100 人以内实验室，建设一套统一的知识库与邮箱协作平台，核心能力包括：

- 按方向建设知识库空间
- 用户注册、审核、分组与权限管理
- Markdown 为核心的知识编辑与沉淀
- 邮箱账号、群组邮箱与日报周报抄送
- Docker 化部署与后续可维护扩展

## 当前阶段

当前仓库已完成从方案设计到首个可部署版本的主链路建设。

已完成内容：

- 用户端 / 管理员端双端结构
- 知识库空间、页面与编辑流程第一版
- 注册、审核、批量建号、登录、强制改密
- 账号与 Mailcow 邮箱生命周期联动
- 开发环境基础设施编排
- 生产部署编排、生产环境模板与上线文档

## 目录结构

```text
apps/
  web/         前端应用目录
  server/      后端应用目录
packages/
  shared/      前后端共享类型、常量和工具
infra/
  docker/      Docker Compose 与基础设施配置
scripts/       初始化、部署、辅助脚本
.github/       CI/CD 配置
doc/           项目文档
```

## 快速入口

- 一键启动本地开发：`pnpm dev:up`
- 彻底重启本地开发：`pnpm dev:restart`
- 查看本地开发状态：`pnpm dev:status`
- 停止本地开发环境：`pnpm dev:down`
- 开发基础设施：`pnpm infra:up`
- 生产部署：`pnpm infra:up:prod`
- 生产部署说明：`doc/线上部署与 Mailcow 接入说明.md`

## 本地开发

推荐使用统一脚本启动本地环境：

```bash
pnpm dev:up
```

该命令会自动完成以下步骤：

- 确保 `apps/server/.env` 存在，不存在时自动从 `.env.example` 复制
- 启动本地 PostgreSQL 容器
- 执行后端 `db:push` 与 `db:seed`
- 启动后端 API：`http://localhost:3001/api`
- 启动前端登录页：`http://localhost:3000/login`

如需把本地默认地址从 `localhost` 改成服务器 IP 或局域网 IP，可在仓库根目录新增 `.env`，并至少配置以下变量：

```bash
WEB_HOST=localhost
WEB_PORT=3000
SERVER_HOST=localhost
SERVER_PORT=3001
NEXT_PUBLIC_API_BASE_URL=
```

- 不配置时默认使用 `localhost`
- 配置 `WEB_HOST` / `SERVER_HOST` 后，`pnpm dev:up`、`pnpm dev:restart`、`pnpm dev:status` 会自动按新地址启动并展示访问链接
- 如果前后端不是简单的 `主机 + 端口` 关系，可直接设置 `NEXT_PUBLIC_API_BASE_URL`
- 服务器启动配置详见 `docs/服务器启动 IP 与 Host 配置说明.md`

常用命令：

```bash
pnpm dev:restart
pnpm dev:status
pnpm dev:down
```

推荐场景：

- 首次启动本地环境：使用 `pnpm dev:up`
- 日常查看服务状态：使用 `pnpm dev:status`
- 停止全部本地服务：使用 `pnpm dev:down`
- 修改了后端路由、接口、构建产物后，希望确保没有旧进程残留：使用 `pnpm dev:restart`

`pnpm dev:restart` 会执行一次更彻底的本地重启流程，用来避免“旧后端还占着 3001 端口，但前端已经在请求新接口”的混乱情况。它会按顺序完成：

- 停止 `local-dev.sh` 托管的本地前后端与 PostgreSQL
- 清理 `storage/dev/*.pid` 中记录的旧进程
- 额外释放 `3000` 和 `3001` 上残留的监听进程
- 重新执行完整的本地启动流程

如果你遇到类似 `Cannot POST /api/...`、明明改了代码但接口还是旧行为、或者重启后提示端口已占用，优先执行：

```bash
pnpm dev:restart
```

日志默认写入 `storage/dev/logs/`。
