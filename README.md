# 3GLabVault

实验室知识库 + 内部邮件协作平台。

本项目面向小规模实验室/社区/兴趣小组，提供统一的知识沉淀、知识库分组权限控制、成员审核、角色群组、内部邮件和外部提醒能力。当前仓库已经包含前端、后端、数据库、缓存、对象存储、HTTPS 入口和一键生产部署脚本。

## 核心能力

- 按方向建设知识库空间，支持 Markdown 编辑、图片上传和权限审批。
- 用户注册、管理员审核、批量建号、强制改密、归档恢复。
- 角色、方向组、年级组、功能组统一管理。
- 站内内部邮件流转，可选使用一个外部 SMTP 邮箱发送提醒。
- Docker Compose 生产部署，Traefik 自动申请 HTTPS 证书。

## 目录结构

```text
apps/
  web/         Next.js 前端
  server/      NestJS 后端 API
packages/
  shared/      共享类型、常量和工具
infra/
  docker/      Docker Compose 与基础设施配置
scripts/       本地开发、生产部署、辅助脚本
docs/          设计、部署、运维说明
storage/       本地运行和部署状态文件
```

## 生产环境一行部署

在一台已经安装 Docker 的 Linux 服务器上，把代码放到服务器后，进入项目根目录执行：

```bash
bash scripts/deploy-production.sh
```

如果服务器还没有项目代码，可用一行命令完成下载并部署，将仓库地址替换为你的实际 Git 地址：

```bash
git clone <your-repo-url> 3GLabVault && cd 3GLabVault && bash scripts/deploy-production.sh
```

首次执行时脚本会交互式生成 `.env.production`，然后自动完成：

1. 校验 Docker Compose 配置。
2. 启动 Traefik、PostgreSQL、Redis、MinIO。
3. 首次部署时执行数据库结构初始化和种子数据写入。
4. 构建并启动后端 `server` 与前端 `web`。
5. 输出容器状态和访问地址。

部署完成后访问：

```text
https://你的域名
```

## 服务器准备

推荐使用一台全新的 Linux 服务器，至少 2 核 CPU、4 GB 内存、30 GB 磁盘。生产环境只需要 Docker 和 Docker Compose 插件，不要求在宿主机安装 Node.js、pnpm、PostgreSQL、Redis 或 MinIO。

Ubuntu / Debian 可先执行：

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git openssl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

执行 `usermod` 后请重新登录服务器，再确认：

```bash
docker --version
docker compose version
```

如果不想重新登录，也可以临时用 `sudo bash scripts/deploy-production.sh` 执行部署。

## IP 与域名配置

生产环境推荐使用域名访问，不建议直接暴露 IP 访问。

1. 在 DNS 服务商处添加一条 `A` 记录，将业务域名指向服务器公网 IP。
   示例：`lab.example.com -> 1.2.3.4`
2. 等待解析生效后再执行部署脚本。
3. 脚本提示“部署域名”时填写完整域名，例如 `lab.example.com`，不要填写 `http://` 或 `https://`。
4. 脚本会把前端访问地址和后端 CORS 地址统一配置成 `https://lab.example.com`。

如果你使用 Cloudflare、校园网网关或反向代理，请确认：

- `80` 端口可以被 Let’s Encrypt HTTP 校验访问。
- `443` 端口可以被浏览器访问。
- 代理层需要透传 `Host` 头。
- 如启用国家访问限制，生产 Compose 默认读取 `cf-ipcountry` 请求头，可通过 `.env.production` 调整：

```env
ACCESS_ALLOWED_COUNTRIES=CN
ACCESS_COUNTRY_HEADER=cf-ipcountry
ACCESS_COUNTRY_STRICT=false
```

## 端口与权限放开

服务器入站端口只需要开放：

| 端口        | 用途                                     |
| --------- | -------------------------------------- |
| `22/tcp`  | SSH 登录服务器，按你的安全策略限制来源 IP               |
| `80/tcp`  | Traefik 接收 HTTP，并用于 Let’s Encrypt 证书校验 |
| `443/tcp` | HTTPS 正式访问入口                           |

不要对公网开放以下内部端口：

| 端口            | 服务             |
| ------------- | -------------- |
| `3000`        | 前端容器内部端口       |
| `3001`        | 后端容器内部端口       |
| `5432`        | PostgreSQL     |
| `6379`        | Redis          |
| `9000 / 9001` | MinIO API 与控制台 |

如果启用外部邮箱提醒，服务器还需要允许出站访问 SMTP 端口：

| 端口        | 常见用途                    |
| --------- | ----------------------- |
| `465/tcp` | SMTP SSL，QQ 邮箱常用        |
| `587/tcp` | SMTP STARTTLS，部分邮箱服务商使用 |

`deploy-production.sh` 会生成 `.env.production`，该文件包含数据库密码、JWT 密钥、SMTP 授权码和管理员初始密码。脚本会用 `umask 077` 写入，默认只有当前系统用户可读写。请不要把 `.env.production` 提交到 Git。

## 中转邮箱配置

系统内部邮件不依赖外部邮件服务器，也不需要开放 `25 / 110 / 143 / 465 / 587 / 993 / 995` 等收信端口。内部邮件只在 3GLabVault 站内流转。

如果希望用户收到“你有新的站内邮件/审批待处理”的外部提醒，需要准备一个 SMTP 中转邮箱。推荐用专门的 QQ 邮箱或企业邮箱，不要使用个人主邮箱。

以 QQ 邮箱为例：

1. 登录 QQ 邮箱后台。
2. 开启 SMTP 服务。
3. 生成 SMTP 授权码，注意不是 QQ 登录密码。
4. 首次执行部署脚本时按提示填写：

```env
EXTERNAL_MAIL_REMINDER_ENABLED=true
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的中转邮箱@qq.com
SMTP_PASS=你的SMTP授权码
SMTP_FROM=你的中转邮箱@qq.com
APP_BASE_URL=https://你的域名
```

如果不需要外部提醒，可以在脚本里把 `EXTERNAL_MAIL_REMINDER_ENABLED` 填为 `false`，或让 `SMTP_USER`、`SMTP_PASS` 留空。站内内部邮件仍可正常使用。

提醒邮件的边界：

- 只发送固定模板提醒，不包含站内邮件正文。
- 不允许用户通过系统向任意外部邮箱自由发信。
- 同一用户 1 分钟内最多收到 1 封外部提醒。
- 外部提醒发送失败不会影响站内邮件投递。

## 脚本会生成的生产配置

首次部署后会生成：

```text
.env.production
storage/deploy/prod-initialized
```

`.env.production` 中最重要的字段包括：

```env
LABVAULT_DOMAIN=lab.example.com
LETSENCRYPT_EMAIL=ops@example.com

POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=...
POSTGRES_APP_DB=labvault
POSTGRES_APP_USER=labvault
POSTGRES_APP_PASSWORD=...

DATABASE_URL=postgresql://labvault:...@postgres:5432/labvault?schema=public
REDIS_URL=redis://redis:6379

MINIO_ROOT_USER=...
MINIO_ROOT_PASSWORD=...
MINIO_BUCKET=labvault

AUTH_TOKEN_SECRET=...
MAIL_DOMAIN=3glab

EXTERNAL_MAIL_REMINDER_ENABLED=true
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
APP_BASE_URL=https://lab.example.com

ADMIN_INITIAL_EMAIL=admin@3glab
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=...
```

`storage/deploy/prod-initialized` 用于标记数据库已经初始化过，避免日常重新部署时重复写入种子数据。

## 生产运维命令

所有命令都在项目根目录执行。

首次部署或更新部署：

```bash
bash scripts/deploy-production.sh up
```

重新生成 `.env.production`：

```bash
bash scripts/deploy-production.sh configure
```

查看容器状态：

```bash
bash scripts/deploy-production.sh status
```

查看日志：

```bash
bash scripts/deploy-production.sh logs
```

停止生产环境：

```bash
bash scripts/deploy-production.sh down
```

重新执行数据库初始化：

```bash
bash scripts/deploy-production.sh reinit
```

注意：`reinit` 只适合首次初始化失败、清空数据库卷后重建等场景。正常更新代码不要执行 `reinit`。

## 首次登录与初始化

部署脚本会提示填写管理员初始账号：

```env
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_EMAIL=admin@3glab
ADMIN_INITIAL_PASSWORD=强密码
```

部署完成后访问 `https://你的域名/login` 登录后台。

后台中的“默认方向组模板”是一次性初始化入口，只会在全新部署且尚未创建任何群组或知识空间时显示。执行后该盒子会立即消失，后端接口也会拒绝重复初始化。

## 本地开发

本地开发推荐使用统一脚本：

```bash
pnpm dev:up
```

该命令会自动：

- 确保 `apps/server/.env` 存在。
- 启动本地 PostgreSQL 容器。
- 执行后端 `db:push` 与 `db:seed`。
- 启动后端 API：`http://localhost:3001/api`。
- 启动前端页面：`http://localhost:3000/login`。

常用本地命令：

```bash
pnpm dev:status
pnpm dev:restart
pnpm dev:down
```

如果要把本地默认地址从 `localhost` 改成局域网 IP，可在仓库根目录 `.env` 配置：

```env
WEB_HOST=0.0.0.0
WEB_PORT=3000
SERVER_HOST=0.0.0.0
SERVER_PORT=3001
NEXT_PUBLIC_API_BASE_URL=
```

更多说明见：

- `docs/服务器启动 IP 与 Host 配置说明.md`
- `docs/一键部署脚本使用说明.md`
- `docs/线上部署与 Mailcow 接入说明.md`

