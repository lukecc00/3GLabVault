# 线上部署与内部邮件隔离说明

## 1. 目标

本项目当前已经不是纯演示形态，而是按“实验室线上长期使用”设计：

- 用户端与管理员端分离
- 账号、群组、角色、知识空间均持久化到 PostgreSQL
- 注册、审核、批量建号、改密、强制改密均已具备完整业务闭环
- 内部邮件能力仅在业务系统内部流转；如有需要，可额外接入一个外部 SMTP 账号，仅用于发送“收到新内部邮件”的提醒通知

## 2. 上线前准备

建议至少准备以下资源：

- 1 台公网 Linux 服务器，用于部署 Web、API、PostgreSQL、Redis、MinIO
- 1 个业务主域名，例如 `lab.example.com`
- 1 个内部邮件地址域名，例如 `3glab`
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

MAIL_DOMAIN=3glab

EXTERNAL_MAIL_REMINDER_ENABLED=true
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=1793026645@qq.com
SMTP_PASS=replace-with-qq-smtp-auth-code
SMTP_FROM=1793026645@qq.com
APP_BASE_URL=https://lab.example.com

ADMIN_INITIAL_EMAIL=xiyou3g@3glab
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=replace-with-a-strong-initial-password
```

关键说明：

- `AUTH_TOKEN_SECRET` 必须替换为高强度随机字符串
- `MAIL_DOMAIN` 只作为系统内部邮件地址域使用
- `SMTP_PASS` 需要填写 QQ 邮箱 SMTP 授权码，而不是 QQ 登录密码
- `APP_BASE_URL` 用于提醒邮件中生成站内邮件入口链接
- `ADMIN_INITIAL_PASSWORD` 不要留默认值，也不要提交到仓库

外部提醒相关字段说明：

- `EXTERNAL_MAIL_REMINDER_ENABLED`
  - 含义：是否开启外部提醒功能
  - 用法：`true` 为开启，`false` 为关闭
- `SMTP_HOST`
  - 含义：SMTP 服务器地址
  - 用法：QQ 邮箱填写 `smtp.qq.com`
- `SMTP_PORT`
  - 含义：SMTP 发信端口
  - 用法：QQ 邮箱常用 `465`
- `SMTP_SECURE`
  - 含义：是否启用 SSL/TLS 加密连接
  - 用法：QQ 邮箱配合 `465` 时填写 `true`
- `SMTP_USER`
  - 含义：SMTP 登录账号
  - 用法：填写启用了 SMTP 服务的发信邮箱地址
- `SMTP_PASS`
  - 含义：SMTP 授权码
  - 用法：填写邮箱服务商签发的授权码，不能填写网页登录密码
- `SMTP_FROM`
  - 含义：对外显示的发件人地址
  - 用法：建议与 `SMTP_USER` 一致
- `APP_BASE_URL`
  - 含义：系统对外访问地址
  - 用法：用于生成提醒邮件中的站内入口链接

### 3.1 启用 QQ SMTP 外部提醒

如果要启用“外部提醒邮箱”能力，建议使用一个专门的 QQ 邮箱作为中转账号，例如 `1793026645@qq.com`。

启用步骤：

1. 登录 QQ 邮箱后台并开启 SMTP 服务
2. 生成 SMTP 授权码
3. 在后端环境变量中填写 `SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
4. 确认 `APP_BASE_URL` 指向线上站点地址
5. 重启后端服务

验证方法：

1. 注册一个带外部提醒邮箱的新用户，或由管理员在用户管理页补录外部提醒邮箱
2. 将该用户审核为 `ACTIVE`
3. 让另一位成员向该用户发送一封内部邮件
4. 检查外部邮箱是否收到提醒邮件

当前实现规则：

- 外部提醒邮件只提示“你有新的内部邮件待处理”
- 只有主送收件人（`To`）会收到外部提醒；抄送收件人（`Cc`）不会收到提醒
- 不包含内部邮件正文、附件和完整收件详情
- 同一用户 1 分钟内最多收到 1 封提醒邮件
- 提醒发送失败不会影响内部邮件在站内的正常投递

### 3.2 切换提醒邮箱账号

如果后续需要把提醒发信账号从一个 QQ 邮箱切换到另一个 QQ 邮箱，可按以下步骤操作：

1. 登录新的 QQ 邮箱后台并开启 SMTP 服务
2. 生成新的 SMTP 授权码
3. 修改后端环境变量：

```env
SMTP_USER=新的QQ邮箱地址
SMTP_PASS=新的QQ邮箱SMTP授权码
SMTP_FROM=新的QQ邮箱地址
```

4. 如果切换到的不是 QQ 邮箱，而是其他服务商，还需要同步检查：

```env
SMTP_HOST=新的SMTP服务器
SMTP_PORT=新的SMTP端口
SMTP_SECURE=按新服务商要求填写 true 或 false
```

5. 重启后端服务
6. 用测试用户执行一次内部邮件收信验证

切换账号后的验收重点：

- 新账号可以正常发出提醒邮件
- 提醒邮件中的发件人显示符合预期
- 系统内内部邮件发送不受影响
- 旧账号授权码不再继续保留在环境变量中

仓库中已经补充了：

- 根目录 `.env.production.example`
- 生产编排 `infra/docker/docker-compose.prod.yml`
- 一键部署脚本 `scripts/deploy-production.sh`
- Nginx 反向代理示例 `infra/docker/nginx/3glabvault.conf.example`

## 4. 内部邮件隔离要求

生产环境必须满足以下边界：

- 不配置 `MX`
- 不开放 `25 / 465 / 587 / 110 / 995 / 143 / 993`
- 不部署 Mailcow、Postfix、Dovecot 等外部邮件服务
- 搜索引擎禁止收录站点，页面默认 `noindex, nofollow`
- 如条件允许，优先放在校园网、内网或 VPN 后访问

如果启用了外部提醒，还需要满足：

- 不把 SMTP 账号暴露给终端用户
- 不允许用户输入任意外部地址进行自由发信
- 外部 SMTP 仅用于固定模板提醒，不得用于转发内部邮件正文

## 5. 当前账号与内部邮件地址生命周期

### 5.1 用户公开注册

用户提交注册后：

1. 生成 `username`
2. 生成 `username@MAIL_DOMAIN`
3. 保存系统密码哈希
4. 账号状态为 `PENDING`
5. 保存外部提醒邮箱

这里生成的是内部邮件地址标识，不进行任何线上邮箱开户。用户填写的外部提醒邮箱只用于后续接收提醒通知。

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

如需启用外部提醒，管理员应在生成后进入 `/admin/users`，选择对应成员并补录真实外部邮箱。

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

### 7.1 推荐的一键部署方式

当前仓库已提供适合新手使用的一键部署脚本：

```bash
bash scripts/deploy-production.sh
```

或：

```bash
pnpm deploy:prod
```

脚本会自动完成：

1. 交互生成 `.env.production`
2. 校验生产 Compose 配置
3. 启动 `traefik`、`postgres`、`redis`、`minio`
4. 首次执行时自动初始化数据库和种子数据
5. 构建并启动 `server` 与 `web`
6. 输出当前容器状态

更多脚本使用方法请查看：

- `doc/一键部署脚本使用说明.md`

如果你当前是在本机开发、调试知识库图片上传或验证 MinIO 存储链路，也请优先参考同一份文档中的“本地开发脚本”章节，里面已经补充：

- `scripts/local-dev.sh` 的启动/停止/状态查看方法
- `scripts/restart-local-project.sh` 的一键重启方法
- MinIO 端口冲突时自动切换到 `9010/9011` 等端口的说明

### 7.2 手动部署方式

推荐按以下顺序上线：

1. 复制 `.env.production.example` 为 `.env.production`
2. 填写正式域名、数据库密码、管理员初始密码，以及外部提醒所需的 SMTP 配置
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
- 已配置外部提醒邮箱的成员在收到内部邮件后可以收到提醒邮件
- 同一成员在 1 分钟内连续收到多封内部邮件时，不会收到多封重复提醒
- 站点页面返回 `noindex` 相关元信息
- 公网未开放标准邮件协议端口
- 直接执行 `node apps/server/dist/main.js` 或容器启动时，不再出现 `dist/generated/prisma` 缺失错误

## 9. 后续可继续增强

- 内部收件箱 / 发件箱 / 草稿箱
- 按群组、按年级的抄送与广播
- 邮件审计日志
- 登录失败次数限制
- 统一认证中心 Keycloak 化
