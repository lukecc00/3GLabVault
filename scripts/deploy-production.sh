#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.prod.yml"
STATE_DIR="$ROOT_DIR/storage/deploy"
INIT_MARKER_FILE="$STATE_DIR/prod-initialized"

mkdir -p "$STATE_DIR"

print_header() {
  printf '\n[\033[1;34m%s\033[0m] %s\n' "3GLabVault" "$1"
}

print_success() {
  printf '[\033[1;32m成功\033[0m] %s\n' "$1"
}

print_error() {
  printf '[\033[1;31mERROR\033[0m] %s\n' "$1" >&2
}

print_warning() {
  printf '[\033[1;33m警告\033[0m] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    print_error "缺少必要命令：$1，请先安装"
    exit 1
  fi
}

require_docker_compose() {
  if ! docker compose version >/dev/null 2>&1; then
    print_error "当前 Docker 不支持 'docker compose'，请安装 Docker Compose 插件后再试"
    exit 1
  fi
}

check_port_available() {
  local port="$1"
  if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_warning "端口 $port 已被占用，可能会导致容器启动失败"
    return 1
  fi
  return 0
}

check_firewall() {
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "active"; then
    print_warning "检测到 UFW 防火墙已启用，请确保已开放 80/443 端口"
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

random_secret() {
  local length="${1:-32}"

  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$length"
    printf '\n'
    return 0
  fi

  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$length"
  printf '\n'
}

prompt_value() {
  local prompt_label="$1"
  local default_value="${2:-}"
  local allow_empty="${3:-false}"
  local input=""

  if [[ ! -t 0 ]]; then
    if [[ -n "$default_value" || "$allow_empty" == "true" ]]; then
      printf '%s' "$default_value"
      return 0
    fi

    print_error "当前为非交互环境，无法自动采集配置：$prompt_label"
    exit 1
  fi

  while true; do
    if [[ -n "$default_value" ]]; then
      read -r -p "$prompt_label [$default_value]: " input
    else
      read -r -p "$prompt_label: " input
    fi

    if [[ -z "$input" ]]; then
      input="$default_value"
    fi

    if [[ -n "$input" || "$allow_empty" == "true" ]]; then
      printf '%s' "$input"
      return 0
    fi

    echo "该项不能为空，请重新输入。"
  done
}

prompt_secret() {
  local prompt_label="$1"
  local default_value="${2:-}"
  local allow_empty="${3:-false}"
  local input=""

  if [[ ! -t 0 ]]; then
    if [[ -n "$default_value" || "$allow_empty" == "true" ]]; then
      printf '%s' "$default_value"
      return 0
    fi

    print_error "当前为非交互环境，无法自动采集配置：$prompt_label"
    exit 1
  fi

  while true; do
    if [[ -n "$default_value" ]]; then
      read -r -s -p "$prompt_label [留空使用当前值]: " input
    else
      read -r -s -p "$prompt_label: " input
    fi
    printf '\n'

    if [[ -z "$input" ]]; then
      input="$default_value"
    fi

    if [[ -n "$input" || "$allow_empty" == "true" ]]; then
      printf '%s' "$input"
      return 0
    fi

    echo "该项不能为空，请重新输入。"
  done
}

confirm() {
  local prompt_label="$1"
  local default_answer="${2:-N}"
  local input=""

  if [[ ! -t 0 ]]; then
    [[ "$default_answer" =~ ^[Yy]$ ]]
    return 0
  fi

  read -r -p "$prompt_label [$default_answer]: " input
  input="${input:-$default_answer}"
  [[ "$input" =~ ^[Yy]$ ]]
}

load_existing_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a && source "$ENV_FILE" && set +a
  fi
}

write_env_file() {
  local domain="$1"
  local letsencrypt_email="$2"
  local use_ip="${3:-false}"
  local http_only="${4:-false}"
  local http_port="${5:-80}"
  local https_port="${6:-443}"
  local postgres_superuser="$7"
  local postgres_superuser_password="$8"
  local postgres_app_db="$9"
  local postgres_app_user="${10}"
  local postgres_app_password="${11}"
  local postgres_keycloak_db="${12}"
  local postgres_keycloak_user="${13}"
  local postgres_keycloak_password="${14}"
  local redis_url="${15}"
  local minio_root_user="${16}"
  local minio_root_password="${17}"
  local minio_bucket="${18}"
  local auth_token_secret="${19}"
  local mail_domain="${20}"
  local admin_initial_email="${21}"
  local admin_initial_username="${22}"
  local admin_initial_password="${23}"
  local mailcow_api_base_url="${24}"
  local mailcow_api_key="${25}"
  local mailcow_default_mailbox_quota="${26}"
  local external_mail_reminder_enabled="${27}"
  local smtp_host="${28}"
  local smtp_port="${29}"
  local smtp_secure="${30}"
  local smtp_user="${31}"
  local smtp_pass="${32}"
  local smtp_from="${33}"
  local app_base_url="${34}"
  local database_url="postgresql://${postgres_app_user}:${postgres_app_password}@postgres:5432/${postgres_app_db}?schema=public"

  umask 077
  cat >"$ENV_FILE" <<EOF
# 部署配置
LABVAULT_DOMAIN=$domain
LABVAULT_USE_IP=$use_ip
LABVAULT_HTTP_ONLY=$http_only
LABVAULT_HTTP_PORT=$http_port
LABVAULT_HTTPS_PORT=$https_port
LETSENCRYPT_EMAIL=$letsencrypt_email

# PostgreSQL 数据库配置
POSTGRES_SUPERUSER=$postgres_superuser
POSTGRES_SUPERUSER_PASSWORD=$postgres_superuser_password
POSTGRES_APP_DB=$postgres_app_db
POSTGRES_APP_USER=$postgres_app_user
POSTGRES_APP_PASSWORD=$postgres_app_password
POSTGRES_KEYCLOAK_DB=$postgres_keycloak_db
POSTGRES_KEYCLOAK_USER=$postgres_keycloak_user
POSTGRES_KEYCLOAK_PASSWORD=$postgres_keycloak_password

# 数据库连接
DATABASE_URL=$database_url
REDIS_URL=$redis_url

# MinIO 对象存储配置
MINIO_ROOT_USER=$minio_root_user
MINIO_ROOT_PASSWORD=$minio_root_password
MINIO_BUCKET=$minio_bucket

# 认证配置
AUTH_TOKEN_SECRET=$auth_token_secret

# 邮件配置
MAIL_DOMAIN=$mail_domain
MAILCOW_API_BASE_URL=$mailcow_api_base_url
MAILCOW_API_KEY=$mailcow_api_key
MAILCOW_DEFAULT_MAILBOX_QUOTA=$mailcow_default_mailbox_quota

# 外部邮箱提醒配置
EXTERNAL_MAIL_REMINDER_ENABLED=$external_mail_reminder_enabled
SMTP_HOST=$smtp_host
SMTP_PORT=$smtp_port
SMTP_SECURE=$smtp_secure
SMTP_USER=$smtp_user
SMTP_PASS=$smtp_pass
SMTP_FROM=$smtp_from
APP_BASE_URL=$app_base_url

# 管理员初始账号
ADMIN_INITIAL_EMAIL=$admin_initial_email
ADMIN_INITIAL_USERNAME=$admin_initial_username
ADMIN_INITIAL_PASSWORD=$admin_initial_password
EOF
}

configure_env() {
  print_header "开始配置生产环境变量"
  echo "请根据提示输入配置信息，方括号 [] 内为默认值，直接回车使用默认值"
  load_existing_env

  local default_domain="${LABVAULT_DOMAIN:-lab.example.com}"
  local default_letsencrypt_email="${LETSENCRYPT_EMAIL:-ops@example.com}"
  local default_use_ip="${LABVAULT_USE_IP:-false}"
  local default_http_only="${LABVAULT_HTTP_ONLY:-false}"
  local default_http_port="${LABVAULT_HTTP_PORT:-80}"
  local default_https_port="${LABVAULT_HTTPS_PORT:-443}"
  local default_postgres_superuser="${POSTGRES_SUPERUSER:-postgres}"
  local default_postgres_superuser_password="${POSTGRES_SUPERUSER_PASSWORD:-$(random_secret 24)}"
  local default_postgres_app_db="${POSTGRES_APP_DB:-labvault}"
  local default_postgres_app_user="${POSTGRES_APP_USER:-labvault}"
  local default_postgres_app_password="${POSTGRES_APP_PASSWORD:-$(random_secret 24)}"
  local default_postgres_keycloak_db="${POSTGRES_KEYCLOAK_DB:-keycloak}"
  local default_postgres_keycloak_user="${POSTGRES_KEYCLOAK_USER:-keycloak}"
  local default_postgres_keycloak_password="${POSTGRES_KEYCLOAK_PASSWORD:-$(random_secret 24)}"
  local default_redis_url="${REDIS_URL:-redis://redis:6379}"
  local default_minio_root_user="${MINIO_ROOT_USER:-minioadmin}"
  local default_minio_root_password="${MINIO_ROOT_PASSWORD:-$(random_secret 24)}"
  local default_minio_bucket="${MINIO_BUCKET:-labvault}"
  local default_auth_token_secret="${AUTH_TOKEN_SECRET:-$(random_secret 48)}"
  local default_mail_domain="${MAIL_DOMAIN:-3glab}"
  local default_admin_initial_username="${ADMIN_INITIAL_USERNAME:-admin}"
  local default_admin_initial_password="${ADMIN_INITIAL_PASSWORD:-$(random_secret 20)}"
  local default_mailcow_api_base_url="${MAILCOW_API_BASE_URL:-}"
  local default_mailcow_api_key="${MAILCOW_API_KEY:-}"
  local default_mailcow_default_mailbox_quota="${MAILCOW_DEFAULT_MAILBOX_QUOTA:-1024}"
  local default_external_mail_reminder_enabled="${EXTERNAL_MAIL_REMINDER_ENABLED:-true}"
  local default_smtp_host="${SMTP_HOST:-smtp.qq.com}"
  local default_smtp_port="${SMTP_PORT:-465}"
  local default_smtp_secure="${SMTP_SECURE:-true}"
  local default_smtp_user="${SMTP_USER:-}"
  local default_smtp_pass="${SMTP_PASS:-}"
  local default_smtp_from="${SMTP_FROM:-$default_smtp_user}"

  local domain
  local letsencrypt_email
  local use_ip
  local http_only
  local http_port
  local https_port
  local postgres_superuser
  local postgres_superuser_password
  local postgres_app_db
  local postgres_app_user
  local postgres_app_password
  local postgres_keycloak_db
  local postgres_keycloak_user
  local postgres_keycloak_password
  local redis_url
  local minio_root_user
  local minio_root_password
  local minio_bucket
  local auth_token_secret
  local mail_domain
  local admin_initial_email
  local admin_initial_username
  local admin_initial_password
  local mailcow_api_base_url
  local mailcow_api_key
  local mailcow_default_mailbox_quota
  local external_mail_reminder_enabled
  local smtp_host
  local smtp_port
  local smtp_secure
  local smtp_user
  local smtp_pass
  local smtp_from
  local app_base_url

  echo ""
  echo "============= 部署基础配置 ============="
  domain="$(prompt_value '请输入部署域名或服务器IP（例如 lab.example.com 或 192.168.1.100）' "$default_domain")"
  
  if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    use_ip="true"
    echo "检测到输入为IP地址，自动设置为IP部署模式"
  else
    use_ip="$(prompt_value '是否使用IP地址部署（true/false，IP部署不支持SSL）' "$default_use_ip")"
  fi

  if [[ "$use_ip" == "true" ]]; then
    http_only="true"
    http_port="$(prompt_value 'HTTP 端口' "$default_http_port")"
    https_port=""
    letsencrypt_email=""
    app_base_url="http://$domain:$http_port"
  else
    http_only="$(prompt_value '是否仅使用HTTP（true/false，生产环境建议使用HTTPS）' "$default_http_only")"
    http_port="$(prompt_value 'HTTP 端口' "$default_http_port")"
    https_port="$(prompt_value 'HTTPS 端口' "$default_https_port")"
    letsencrypt_email="$(prompt_value '请输入 LetsEncrypt 通知邮箱（用于SSL证书申请）' "$default_letsencrypt_email")"
    if [[ "$http_only" == "true" ]]; then
      app_base_url="http://$domain:$http_port"
    else
      app_base_url="https://$domain:$https_port"
    fi
  fi

  echo ""
  echo "============= 数据库配置 ============="
  postgres_superuser="$(prompt_value 'PostgreSQL 超级用户名' "$default_postgres_superuser")"
  postgres_superuser_password="$(prompt_secret 'PostgreSQL 超级用户密码' "$default_postgres_superuser_password")"
  postgres_app_db="$(prompt_value '业务数据库名' "$default_postgres_app_db")"
  postgres_app_user="$(prompt_value '业务数据库用户名' "$default_postgres_app_user")"
  postgres_app_password="$(prompt_secret '业务数据库密码' "$default_postgres_app_password")"
  postgres_keycloak_db="$(prompt_value 'Keycloak 数据库名' "$default_postgres_keycloak_db")"
  postgres_keycloak_user="$(prompt_value 'Keycloak 数据库用户名' "$default_postgres_keycloak_user")"
  postgres_keycloak_password="$(prompt_secret 'Keycloak 数据库密码' "$default_postgres_keycloak_password")"
  redis_url="$(prompt_value 'Redis 连接串' "$default_redis_url")"

  echo ""
  echo "============= 对象存储配置 ============="
  minio_root_user="$(prompt_value 'MinIO Root 用户名' "$default_minio_root_user")"
  minio_root_password="$(prompt_secret 'MinIO Root 密码' "$default_minio_root_password")"
  minio_bucket="$(prompt_value 'MinIO Bucket 名称' "$default_minio_bucket")"

  echo ""
  echo "============= 认证配置 ============="
  auth_token_secret="$(prompt_secret 'JWT 鉴权密钥（用于生成用户Token）' "$default_auth_token_secret")"

  echo ""
  echo "============= 邮件配置 ============="
  mail_domain="$(prompt_value '系统内部邮件后缀域名（如 3glab，则用户邮箱为 user@3glab）' "$default_mail_domain")"

  echo ""
  echo "============= Mailcow 邮件服务配置（可选）============"
  mailcow_api_base_url="$(prompt_value 'Mailcow API 地址（可留空，不启用则仅支持内部邮件）' "$default_mailcow_api_base_url" true)"
  if [[ -n "$mailcow_api_base_url" ]]; then
    mailcow_api_key="$(prompt_secret 'Mailcow API Key' "$default_mailcow_api_key")"
    mailcow_default_mailbox_quota="$(prompt_value 'Mailcow 默认邮箱配额（MB）' "$default_mailcow_default_mailbox_quota")"
  else
    mailcow_api_key=""
    mailcow_default_mailbox_quota="$default_mailcow_default_mailbox_quota"
  fi

  echo ""
  echo "============= 外部邮箱提醒配置（可选）============"
  external_mail_reminder_enabled="$(prompt_value '是否启用外部邮箱提醒（true/false）' "$default_external_mail_reminder_enabled")"
  if [[ "$external_mail_reminder_enabled" == "true" ]]; then
    smtp_host="$(prompt_value '中转 SMTP 服务器地址（如 smtp.qq.com）' "$default_smtp_host")"
    smtp_port="$(prompt_value '中转 SMTP 端口（如 465）' "$default_smtp_port")"
    smtp_secure="$(prompt_value '中转 SMTP 是否使用 SSL/TLS（true/false）' "$default_smtp_secure")"
    smtp_user="$(prompt_value '中转 SMTP 登录邮箱' "$default_smtp_user")"
    smtp_pass="$(prompt_secret '中转 SMTP 授权码/密码' "$default_smtp_pass")"
    smtp_from="$(prompt_value '中转提醒发件人地址（可留空，默认使用登录邮箱）' "${default_smtp_from:-$smtp_user}" true)"
  else
    smtp_host=""
    smtp_port=""
    smtp_secure=""
    smtp_user=""
    smtp_pass=""
    smtp_from=""
  fi

  echo ""
  echo "============= 管理员账号配置 ============="
  admin_initial_username="$(prompt_value '管理员初始用户名' "$default_admin_initial_username")"
  admin_initial_email="$(prompt_value '管理员初始邮箱' "${ADMIN_INITIAL_EMAIL:-${admin_initial_username}@${mail_domain}}")"
  admin_initial_password="$(prompt_secret '管理员初始密码' "$default_admin_initial_password")"

  echo ""
  echo "============= 配置确认 ============="
  echo "即将生成配置文件，主要配置如下："
  echo "  - 部署地址: $app_base_url"
  echo "  - 数据库: $postgres_app_db"
  echo "  - 内部邮件后缀: @$mail_domain"
  echo "  - 管理员账号: $admin_initial_username"
  echo "  - 启用外部邮箱提醒: $external_mail_reminder_enabled"
  
  if ! confirm "确认以上配置正确并继续？" "Y"; then
    echo "配置已取消，退出脚本。"
    exit 0
  fi

  write_env_file \
    "$domain" \
    "$letsencrypt_email" \
    "$use_ip" \
    "$http_only" \
    "$http_port" \
    "$https_port" \
    "$postgres_superuser" \
    "$postgres_superuser_password" \
    "$postgres_app_db" \
    "$postgres_app_user" \
    "$postgres_app_password" \
    "$postgres_keycloak_db" \
    "$postgres_keycloak_user" \
    "$postgres_keycloak_password" \
    "$redis_url" \
    "$minio_root_user" \
    "$minio_root_password" \
    "$minio_bucket" \
    "$auth_token_secret" \
    "$mail_domain" \
    "$admin_initial_email" \
    "$admin_initial_username" \
    "$admin_initial_password" \
    "$mailcow_api_base_url" \
    "$mailcow_api_key" \
    "$mailcow_default_mailbox_quota" \
    "$external_mail_reminder_enabled" \
    "$smtp_host" \
    "$smtp_port" \
    "$smtp_secure" \
    "$smtp_user" \
    "$smtp_pass" \
    "$smtp_from" \
    "$app_base_url"

  print_success "配置文件已生成: $ENV_FILE"
  echo "请妥善保管该文件，脚本已按仅当前用户可读写方式写入。"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    configure_env
  else
    echo "检测到已存在配置文件: $ENV_FILE"
    echo "如需重新配置，请执行: bash scripts/deploy-production.sh configure"
  fi
}

validate_compose() {
  print_header "校验 Docker Compose 配置"
  if ! compose config >/dev/null 2>&1; then
    print_error "Docker Compose 配置校验失败，请检查配置文件"
    exit 1
  fi
  print_success "Docker Compose 配置校验通过"
}

initialize_database() {
  print_header "初始化数据库结构和种子数据"
  if ! compose --profile tools run --rm server-init; then
    print_error "数据库初始化失败"
    exit 1
  fi
  touch "$INIT_MARKER_FILE"
  print_success "数据库初始化完成"
}

deploy_up() {
  print_header "========== 开始部署 3GLabVault 生产环境 =========="
  
  print_header "检查系统依赖"
  require_command docker
  require_docker_compose
  require_command pnpm
  
  check_firewall

  print_header "确保配置文件"
  ensure_env_file

  load_existing_env

  print_header "检查端口占用"
  local http_port="${LABVAULT_HTTP_PORT:-80}"
  local https_port="${LABVAULT_HTTPS_PORT:-443}"
  check_port_available "$http_port"
  check_port_available "$https_port"

  print_header "校验配置"
  validate_compose

  print_header "安装项目依赖"
  if [[ ! -d "node_modules" ]]; then
    print_header "安装项目依赖..."
    pnpm install --frozen-lockfile
  else
    print_success "项目依赖已安装"
  fi

  print_header "启动基础设施服务"
  compose up -d postgres redis minio
  print_success "基础设施服务启动中，请等待健康检查完成..."
  
  print_header "等待数据库服务就绪"
  local max_wait=60
  local wait_count=0
  while ! compose exec postgres pg_isready -U "${POSTGRES_SUPERUSER:-postgres}" >/dev/null 2>&1; do
    sleep 2
    wait_count=$((wait_count + 2))
    if [[ $wait_count -ge $max_wait ]]; then
      print_error "数据库服务启动超时"
      exit 1
    fi
    echo -n "."
  done
  echo ""
  print_success "数据库服务就绪"

  if [[ ! -f "$INIT_MARKER_FILE" ]]; then
    initialize_database
  else
    print_warning "检测到已初始化标记，跳过数据库初始化"
    echo "如需重新初始化，可执行：bash scripts/deploy-production.sh reinit"
  fi

  print_header "构建并启动业务服务"
  compose up -d --build server web

  print_header "等待服务启动..."
  sleep 10

  show_status

  print_header "========== 部署完成 =========="
  local access_url
  if [[ -f "$ENV_FILE" ]]; then
    access_url="$(grep '^APP_BASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
    if [[ -z "$access_url" ]]; then
      access_url="https://$(grep '^LABVAULT_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
    fi
  else
    access_url="https://localhost"
  fi
  
  echo ""
  print_success "3GLabVault 生产环境部署完成！"
  echo ""
  echo "访问地址: $access_url"
  echo "管理员账号: ${ADMIN_INITIAL_USERNAME:-admin}"
  echo "管理员邮箱: ${ADMIN_INITIAL_EMAIL:-admin@3glab}"
  echo ""
  if [[ "$(grep '^LABVAULT_HTTP_ONLY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)" != "true" ]]; then
    echo "提示：如首次部署或申请证书，HTTPS 生效可能需要等待几十秒。"
  fi
  echo "查看日志: bash scripts/deploy-production.sh logs"
  echo "查看状态: bash scripts/deploy-production.sh status"
}

deploy_down() {
  if [[ ! -f "$ENV_FILE" ]]; then
    print_error "未找到 $ENV_FILE，无法停止生产栈"
    exit 1
  fi

  print_header "停止生产服务"
  compose down
  print_success "生产服务已停止"
}

show_status() {
  if [[ ! -f "$ENV_FILE" ]]; then
    print_error "未找到 $ENV_FILE，请先执行部署"
    exit 1
  fi

  print_header "当前容器状态"
  compose ps
}

show_logs() {
  if [[ ! -f "$ENV_FILE" ]]; then
    print_error "未找到 $ENV_FILE，请先执行部署"
    exit 1
  fi

  print_header "跟随查看日志"
  compose logs -f --tail=120
}

reinitialize() {
  ensure_env_file
  validate_compose
  
  print_header "停止现有服务"
  compose down
  
  print_header "清除初始化标记"
  rm -f "$INIT_MARKER_FILE"
  
  print_header "启动数据库依赖"
  compose up -d postgres
  
  print_header "等待数据库就绪"
  sleep 10
  
  initialize_database
  
  print_success "数据库重新初始化完成"
}

usage() {
  cat <<'EOF'
用法:
  bash scripts/deploy-production.sh [up|down|status|logs|configure|reinit]

说明:
  up         首次或日常一键部署生产环境（自动引导配置）
  down       停止生产环境
  status     查看当前容器状态
  logs       跟随查看容器日志
  configure  重新生成 .env.production 配置文件
  reinit     重新执行数据库初始化（会清除现有数据）

示例:
  # 一键部署（首次部署会引导配置）
  bash scripts/deploy-production.sh up

  # 仅配置环境变量
  bash scripts/deploy-production.sh configure

  # 查看运行状态
  bash scripts/deploy-production.sh status

  # 查看日志
  bash scripts/deploy-production.sh logs

  # 停止服务
  bash scripts/deploy-production.sh down
EOF
}

main() {
  if [[ $# -gt 1 ]]; then
    usage
    exit 1
  fi

  case "${1:-up}" in
    up)
      deploy_up
      ;;
    down)
      deploy_down
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs
      ;;
    configure)
      if [[ -f "$ENV_FILE" ]]; then
        cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
        print_warning "已备份现有配置文件"
      fi
      configure_env
      ;;
    reinit)
      if ! confirm "警告：此操作将清除现有数据库并重新初始化，确定继续？" "N"; then
        echo "操作已取消"
        exit 0
      fi
      reinitialize
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${1:-up}"