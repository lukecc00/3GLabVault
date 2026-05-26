# 线上部署与内部邮件隔离说明

## 1. 目标

本项目当前已经不是纯演示形态，而是按“实验室线上长期使用”设计：

- 用户端与管理员端分离
- 账号、群组、角色、知识空间均持久化到 PostgreSQL
- 注册、审核、批量建号、改密、强制改密均已具备完整业务闭环
- 内部邮件能力仅在业务系统内部流转，不接入外部邮箱服务

## 2. 上线前准备

建议至少准备以下资源：

- 1 台公网 Linux 服务器，用于部署 Web、API、PostgreSQL、Redis、MinIO
- 1 个业务主域名，例如 `lab.example.com`
- 1 个内部邮件地址域名，例如 `3glab.local`
- HTTPS 证书
- PostgreSQL 数据库备份策略
- 对象存储备份策略

内部邮件模块不需要独立邮件服务器，也不需要开放标准邮件端口。

## 3. 必要环境变量

后端至少需要配置：

```env
PORT=3001
CORS_ORIGIN=https://lab.example.com
AUTH_TOKEN_SECRET=replace-with-a-strong-random-secret
DATABASE_URL=postgresql://labvault:strong_password@postgres:5432/labvault?schema=public
REDIS_URL=redis://redis:6379

MAIL_DOMAIN=3glab.local

ADMIN_INITIAL_EMAIL=xiyou3g@3glab.local
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=replace-with-a-strong-initial-password
```

关键说明：

- `AUTH_TOKEN_SECRET` 必须替换为高强度随机字符串
- `MAIL_DOMAIN` 只作为系统内部邮件地址域使用
- `ADMIN_INITIAL_PASSWORD` 不要留默认值，也不要提交到仓库

仓库中已经补充了：

- 根目录 `.env.production.example`
- 生产编排 `infra/docker/docker-compose.prod.yml`
- Nginx 反向代理示例 `infra/docker/nginx/3glabvault.conf.example`

## 4. 内部邮件隔离要求

生产环境必须满足以下边界：

- 不配置 `MX`
- 不开放 `25 / 465 / 587 / 110 / 995 / 143 / 993`
- 不部署 Mailcow、Postfix、Dovecot 等外部邮件服务
- 不接第三方发信通道
- 搜索引擎禁止收录站点，页面默认 `noindex, nofollow`
- 如条件允许，优先放在校园网、内网或 VPN 后访问

## 5. 当前账号与内部邮件地址生命周期

### 5.1 用户公开注册

用户提交注册后：

1. 生成 `username`
2. 生成 `username@MAIL_DOMAIN`
3. 保存系统密码哈希
4. 账号状态为 `PENDING`

这里生成的是内部邮件地址标识，不进行任何线上邮箱开户。

### 5.2 管理员审核

管理员审核时：

- `PENDING -> ACTIVE`：启用账号和内部邮件使用资格
- `ACTIVE -> DISABLED/REJECTED`：停用账号，并阻止继续使用内部邮件能力

### 5.3 批量生成账号

管理员批量生成账号时：

- 账号直接为 `ACTIVE`
- 生成一次性临时密码
- 标记 `mustChangePassword=true`
- 自动生成内部邮件地址

### 5.4 改密与重置密码

- 用户在 `/change-password` 修改密码时，只修改业务系统密码
- 管理员在后台重置密码时，只修改业务系统密码
- 管理员重置后，系统强制该成员下一次登录必须修改密码

## 6. 管理员初始化策略

`seed.js` 已改为环境变量初始化管理员账号：

- `ADMIN_INITIAL_EMAIL`
- `ADMIN_INITIAL_USERNAME`
- `ADMIN_INITIAL_PASSWORD`

如果未提供 `ADMIN_INITIAL_PASSWORD`，脚本会生成一次性密码并输出到终端。

线上建议：

- 首次部署明确指定该密码
- 首次登录后立即修改
- 初始化完成后，将该密码从部署平台变量中替换或轮换

## 7. 部署建议

推荐按以下顺序上线：

1. 复制 `.env.production.example` 为 `.env.production`
2. 填写正式域名、数据库密码、管理员初始密码、Mailcow API Key
3. 首次初始化数据库：

```bash
docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml run --rm --profile tools server-init
```

4. 启动生产服务：

```bash
pnpm infra:up:prod
```

5. 如需停止服务：

```bash
pnpm infra:down:prod
```

6. 用测试账号执行注册、审核、登录、改密全链路验证

当前生产编排默认包含：

- `traefik`：自动 HTTPS 与入口路由
- `web`：Next.js 用户端与管理端
- `server`：NestJS API
- `postgres`
- `redis`
- `minio`

## 8. 上线验收清单

上线前建议至少手工确认：

- 管理员账号首次登录会强制改密
- 普通成员注册后处于待审核状态
- 审核通过后成员可以登录用户端
- 批量生成账号后能拿到临时密码
- 首次登录改密后能继续访问对应端
- 禁用成员后不能再使用内部邮件能力
- 站点页面返回 `noindex` 相关元信息
- 公网未开放标准邮件协议端口
- 直接执行 `node apps/server/dist/main.js` 或容器启动时，不再出现 `dist/generated/prisma` 缺失错误

## 9. 后续可继续增强

- 内部收件箱 / 发件箱 / 草稿箱
- 按群组、按年级的抄送与广播
- 邮件审计日志
- 登录失败次数限制
- 统一认证中心 Keycloak 化
