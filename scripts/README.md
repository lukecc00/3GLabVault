# scripts

辅助脚本目录。

## 当前可用脚本

- `local-dev.sh`：统一管理本地开发环境
- `restart-local-project.sh`：彻底重启本地开发环境，避免新旧服务混跑

常用用法：

```bash
pnpm dev:up
pnpm dev:restart
pnpm dev:status
pnpm dev:down
```

对应行为：

- `dev:up`：启动 PostgreSQL、同步数据库、写入种子数据，并拉起后端与前端
- `dev:restart`：先停止脚本托管进程，再清理 `3000/3001` 端口残留监听，最后重新启动整套本地环境
- `dev:status`：查看 PostgreSQL、后端、前端当前状态
- `dev:down`：停止脚本托管的本地后端进程，并停止 PostgreSQL 容器

## 何时使用 `dev:restart`

以下情况优先执行 `pnpm dev:restart`，不要只手动 `pnpm build` 或单独重启某一个服务：

- 后端新增或修改了路由，但前端仍命中旧接口
- 浏览器提示 `Cannot POST /api/...` 或接口行为与当前源码不一致
- 本地显示服务已启动，但 `3000/3001` 端口实际上仍被旧进程占用
- 需要确保 `dist/main`、PID 文件、端口监听三者都切换到最新版本

脚本执行流程：

1. 调用 `local-dev.sh down`
2. 清理 `storage/dev/server.pid` 与 `storage/dev/web.pid` 记录的旧进程
3. 强制释放 `3000` 和 `3001` 上仍在监听的残留进程
4. 调用 `local-dev.sh up` 重新启动 PostgreSQL、后端和前端

日志目录：

- `storage/dev/logs/server.log`
- `storage/dev/logs/web.log`

## 后续建议存放

- 本地初始化脚本
- 环境检查脚本
- 数据导入导出脚本
- 部署辅助脚本
