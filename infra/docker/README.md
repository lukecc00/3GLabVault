# docker

基础设施与部署配置目录。

当前已包含：

- `docker-compose.yml`：本地开发基础服务编排
- `docker-compose.prod.yml`：生产部署编排，包含 Traefik、Web、Server、PostgreSQL、Redis、MinIO
- `postgres/init/01-init-multiple-dbs.sh`：初始化业务库与 Keycloak 数据库
- `nginx/3glabvault.conf.example`：如不使用 Traefik，可改用 Nginx 的 HTTPS 反向代理示例

## 本地开发

推荐优先使用根目录的一键脚本启动本地环境：

```bash
pnpm dev:up
```

该脚本会自动启动本地 PostgreSQL，并继续完成后端数据库同步、种子写入以及前后端启动。

基础服务包括：

- PostgreSQL
- Redis
- MinIO
- Keycloak

启动方式：

1. 在仓库根目录复制 `.env.example` 为 `.env`
2. 如果只需要本地开发主链路，执行 `pnpm dev:up`
3. 如果只想单独拉起基础设施，执行 `pnpm infra:up`
4. 停止一键启动的本地环境可执行 `pnpm dev:down`
5. 停止全部基础设施可执行 `pnpm infra:down`

## 生产部署

生产编排默认使用 Traefik 自动签发 HTTPS 证书。

对新手最友好的方式不是手动执行 Compose，而是直接使用仓库根目录的一键脚本：

```bash
bash scripts/deploy-production.sh
```

脚本会自动完成：

1. 生成 `.env.production`
2. 校验 `docker-compose.prod.yml`
3. 启动 `traefik`、`postgres`、`redis`、`minio`
4. 首次执行时自动初始化数据库
5. 构建并启动 `server` 和 `web`

生产环境安全组 / 防火墙建议：

- 放行 `22/tcp`、`80/tcp`、`443/tcp`
- 不对公网放行 `5432/tcp`、`6379/tcp`、`9000/tcp`、`9001/tcp`
- 不对公网放行标准邮件端口 `25/465/587/110/995/143/993`

如果你明确需要手动执行 Compose，再使用以下方式。

手动部署步骤：

1. 在仓库根目录复制 `.env.production.example` 为 `.env.production`
2. 填写域名、数据库密码、管理员初始密码、Mailcow API Key
3. 首次初始化数据库：

```bash
docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml run --rm --profile tools server-init
```

4. 启动生产服务：

```bash
pnpm infra:up:prod
```

5. 停止生产服务：

```bash
pnpm infra:down:prod
```

更完整的新手部署说明请查看：

- `doc/一键部署脚本使用说明.md`
