# 服务器启动 IP 与 Host 配置说明

## 目标

项目中的前后端访问地址不再依赖固定的 `localhost` 或 `127.0.0.1`。

- 未配置时，默认使用 `localhost`
- 需要部署到服务器或局域网访问时，可通过环境变量切换为实际 IP / 域名
- 本地启动脚本、前端 API 地址解析、后端监听地址与默认 CORS 已统一支持配置

## 一、根目录 `.env` 配置

推荐在仓库根目录创建 `.env`，用于统一管理本地开发或服务器启动时的主机/IP 配置。

示例：

```bash
WEB_PROTOCOL=http
WEB_HOST=localhost
WEB_PORT=3000

SERVER_PROTOCOL=http
SERVER_HOST=localhost
SERVER_PORT=3001

# 如果为空，则前端默认按 SERVER_PROTOCOL + SERVER_HOST + SERVER_PORT 拼接 API 地址
NEXT_PUBLIC_API_BASE_URL=
```

说明：

- `WEB_HOST`：前端访问主机，可填写 `localhost`、服务器内网 IP、外网 IP 或域名
- `WEB_PORT`：前端端口，默认 `3000`
- `SERVER_HOST`：后端访问主机，默认 `localhost`
- `SERVER_PORT`：后端端口，默认 `3001`
- `NEXT_PUBLIC_API_BASE_URL`：前端 API 完整地址，适合前后端分离部署、反向代理或独立域名场景

## 二、默认行为

### 1. 不做任何配置

默认等价于：

```bash
WEB_HOST=localhost
WEB_PORT=3000
SERVER_HOST=localhost
SERVER_PORT=3001
```

对应访问地址：

- 前端：`http://localhost:3000/login`
- 后端：`http://localhost:3001/api`

### 2. 只改主机/IP

例如服务器 IP 为 `10.0.0.12`：

```bash
WEB_HOST=10.0.0.12
SERVER_HOST=10.0.0.12
```

此时本地脚本会自动使用：

- 前端：`http://10.0.0.12:3000/login`
- 后端：`http://10.0.0.12:3001/api`

### 3. 前后端地址不一致

如果前端页面和后端 API 并不共享同一个主机/IP，建议直接指定完整 API 地址：

```bash
WEB_HOST=lab.example.com
WEB_PORT=3000

NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
```

## 三、脚本行为

以下脚本会自动读取根目录 `.env`：

- `pnpm dev:up`
- `pnpm dev:restart`
- `pnpm dev:status`

效果包括：

- 按配置的 `WEB_HOST` / `WEB_PORT` 启动前端
- 按配置的 `SERVER_HOST` / `SERVER_PORT` 启动后端
- 前端自动注入 API 地址配置
- 后端默认使用对应的前端地址作为 `CORS_ORIGIN` 和 `APP_BASE_URL`

## 四、前端配置规则

前端 API 地址按以下优先级解析：

1. `NEXT_PUBLIC_API_BASE_URL`
2. `NEXT_PUBLIC_API_PROTOCOL + NEXT_PUBLIC_API_HOST + NEXT_PUBLIC_API_PORT`
3. 开发环境下，使用当前前端页面所在主机 + 默认 API 端口拼接
4. 非独立开发端口场景下，回退为同源的 `/api`

这意味着：

- 服务器部署时可配置为固定 API 域名
- 局域网开发时可直接把 `localhost` 换成局域网 IP
- 未配置时仍保持默认 `localhost`

## 五、后端配置规则

后端现支持以下默认配置：

```bash
HOST=localhost
PORT=3001
WEB_PROTOCOL=http
WEB_HOST=localhost
WEB_PORT=3000
```

默认行为：

- `HOST` 控制后端监听地址
- `PORT` 控制后端监听端口
- `CORS_ORIGIN` 未配置时，会自动按 `WEB_PROTOCOL://WEB_HOST:WEB_PORT` 生成默认值

如果你需要更精细的跨域控制，仍可直接设置：

```bash
CORS_ORIGIN=https://lab.example.com,https://admin.example.com
APP_BASE_URL=https://lab.example.com
```

## 六、推荐场景

### 本机开发

```bash
WEB_HOST=localhost
SERVER_HOST=localhost
```

### 局域网调试

```bash
WEB_HOST=192.168.1.20
SERVER_HOST=192.168.1.20
```

### 反向代理部署

```bash
WEB_HOST=lab.example.com
WEB_PORT=443
NEXT_PUBLIC_API_BASE_URL=https://lab.example.com/api
```

## 七、注意事项

- `NEXT_PUBLIC_*` 变量会参与前端构建，生产构建前请确认值正确
- 如果前端是通过 Docker 镜像构建，需在构建阶段传入 `NEXT_PUBLIC_API_BASE_URL`
- 若使用 `0.0.0.0` 作为监听地址，建议同时把展示给用户访问的 `WEB_HOST` / `SERVER_HOST` 设置为实际可访问的 IP 或域名
