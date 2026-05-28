#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.prod.yml"
STATE_DIR="$ROOT_DIR/storage/deploy"
INIT_MARKER_FILE="$STATE_DIR/prod-initialized"

mkdir -p "$STATE_DIR"

print_header() {
  printf '\n[%s] %s\n' "3GLabVault" "$1"
}

print_error() {
  printf '[3GLabVault] ERROR: %s\n' "$1" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    print_error "缺少必要命令：$1"
    exit 1
  fi
}

require_docker_compose() {
  if ! docker compose version >/dev/null 2>&1; then
    print_error "当前 Docker 不支持 'docker compose'，请安装 Docker Compose 插件后再试"
    exit 1
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
    # shellcheck disable=SC1090
    set -a && source "$ENV_FILE" && set +a
  fi
}

write_env_file() {
  local domain="$1"
  local letsencrypt_email="$2"
  local postgres_superuser="$3"
  local postgres_superuser_password="$4"
  local postgres_app_db="$5"
  local postgres_app_user="$6"
  local postgres_app_password="$7"
  local postgres_keycloak_db="$8"
  local postgres_keycloak_user="$9"
  local postgres_keycloak_password="${10}"
  local redis_url="${11}"
  local minio_root_user="${12}"
  local minio_root_password="${13}"
  local minio_bucket="${14}"
  local auth_token_secret="${15}"
  local mail_domain="${16}"
  local admin_initial_email="${17}"
  local admin_initial_username="${18}"
  local admin_initial_password="${19}"
  local mailcow_api_base_url="${20}"
  local mailcow_api_key="${21}"
  local mailcow_default_mailbox_quota="${22}"
  local external_mail_reminder_enabled="${23}"
  local smtp_host="${24}"
  local smtp_port="${25}"
  local smtp_secure="${26}"
  local smtp_user="${27}"
  local smtp_pass="${28}"
  local smtp_from="${29}"
  local app_base_url="${30}"
  local database_url="postgresql://${postgres_app_user}:${postgres_app_password}@postgres:5432/${postgres_app_db}?schema=public"

  umask 077
  cat >"$ENV_FILE" <<EOF
LABVAULT_DOMAIN=$domain
LETSENCRYPT_EMAIL=$letsencrypt_email

POSTGRES_SUPERUSER=$postgres_superuser
POSTGRES_SUPERUSER_PASSWORD=$postgres_superuser_password
POSTGRES_APP_DB=$postgres_app_db
POSTGRES_APP_USER=$postgres_app_user
POSTGRES_APP_PASSWORD=$postgres_app_password
POSTGRES_KEYCLOAK_DB=$postgres_keycloak_db
POSTGRES_KEYCLOAK_USER=$postgres_keycloak_user
POSTGRES_KEYCLOAK_PASSWORD=$postgres_keycloak_password

DATABASE_URL=$database_url
REDIS_URL=$redis_url

MINIO_ROOT_USER=$minio_root_user
MINIO_ROOT_PASSWORD=$minio_root_password
MINIO_BUCKET=$minio_bucket

AUTH_TOKEN_SECRET=$auth_token_secret

MAIL_DOMAIN=$mail_domain
MAILCOW_API_BASE_URL=$mailcow_api_base_url
MAILCOW_API_KEY=$mailcow_api_key
MAILCOW_DEFAULT_MAILBOX_QUOTA=$mailcow_default_mailbox_quota

EXTERNAL_MAIL_REMINDER_ENABLED=$external_mail_reminder_enabled
SMTP_HOST=$smtp_host
SMTP_PORT=$smtp_port
SMTP_SECURE=$smtp_secure
SMTP_USER=$smtp_user
SMTP_PASS=$smtp_pass
SMTP_FROM=$smtp_from
APP_BASE_URL=$app_base_url

ADMIN_INITIAL_EMAIL=$admin_initial_email
ADMIN_INITIAL_USERNAME=$admin_initial_username
ADMIN_INITIAL_PASSWORD=$admin_initial_password
EOF
}

configure_env() {
  print_header "配置生产环境变量"
  load_existing_env

  local default_domain="${LABVAULT_DOMAIN:-lab.example.com}"
  local default_email="${LETSENCRYPT_EMAIL:-ops@example.com}"
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

  domain="$(prompt_value '请输入部署域名（例如 lab.example.com）' "$default_domain")"
  letsencrypt_email="$(prompt_value '请输入 LetsEncrypt 通知邮箱' "$default_email")"
  postgres_superuser="$(prompt_value 'PostgreSQL 超级用户名' "$default_postgres_superuser")"
  postgres_superuser_password="$(prompt_secret 'PostgreSQL 超级用户密码' "$default_postgres_superuser_password")"
  postgres_app_db="$(prompt_value '业务数据库名' "$default_postgres_app_db")"
  postgres_app_user="$(prompt_value '业务数据库用户名' "$default_postgres_app_user")"
  postgres_app_password="$(prompt_secret '业务数据库密码' "$default_postgres_app_password")"
  postgres_keycloak_db="$(prompt_value 'Keycloak 数据库名' "$default_postgres_keycloak_db")"
  postgres_keycloak_user="$(prompt_value 'Keycloak 数据库用户名' "$default_postgres_keycloak_user")"
  postgres_keycloak_password="$(prompt_secret 'Keycloak 数据库密码' "$default_postgres_keycloak_password")"
  redis_url="$(prompt_value 'Redis 连接串' "$default_redis_url")"
  minio_root_user="$(prompt_value 'MinIO Root 用户名' "$default_minio_root_user")"
  minio_root_password="$(prompt_secret 'MinIO Root 密码' "$default_minio_root_password")"
  minio_bucket="$(prompt_value 'MinIO Bucket 名称' "$default_minio_bucket")"
  auth_token_secret="$(prompt_secret 'JWT 鉴权密钥' "$default_auth_token_secret")"
  mail_domain="$(prompt_value '系统内部邮件域名' "$default_mail_domain")"
  admin_initial_username="$(prompt_value '管理员初始用户名' "$default_admin_initial_username")"
  admin_initial_email="$(prompt_value '管理员初始邮箱' "${ADMIN_INITIAL_EMAIL:-${admin_initial_username}@${mail_domain}}")"
  admin_initial_password="$(prompt_secret '管理员初始密码' "$default_admin_initial_password")"
  mailcow_api_base_url="$(prompt_value 'Mailcow API 地址（可留空）' "$default_mailcow_api_base_url" true)"
  mailcow_api_key="$(prompt_secret 'Mailcow API Key（可留空）' "$default_mailcow_api_key" true)"
  mailcow_default_mailbox_quota="$(prompt_value 'Mailcow 默认邮箱配额（MB）' "$default_mailcow_default_mailbox_quota")"
  external_mail_reminder_enabled="$(prompt_value '是否启用外部邮箱提醒（true/false）' "$default_external_mail_reminder_enabled")"
  smtp_host="$(prompt_value '中转 SMTP 服务器地址（可留空）' "$default_smtp_host" true)"
  smtp_port="$(prompt_value '中转 SMTP 端口（可留空）' "$default_smtp_port" true)"
  smtp_secure="$(prompt_value '中转 SMTP 是否使用 SSL/TLS（true/false，可留空）' "$default_smtp_secure" true)"
  smtp_user="$(prompt_value '中转 SMTP 登录邮箱（可留空，不启用外部提醒）' "$default_smtp_user" true)"
  smtp_pass="$(prompt_secret '中转 SMTP 授权码/密码（可留空，不启用外部提醒）' "$default_smtp_pass" true)"
  smtp_from="$(prompt_value '中转提醒发件人地址（可留空，默认使用登录邮箱）' "${default_smtp_from:-$smtp_user}" true)"
  app_base_url="https://$domain"

  write_env_file \
    "$domain" \
    "$letsencrypt_email" \
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

  print_header "已生成 $ENV_FILE"
  echo "请妥善保管该文件，脚本已按仅当前用户可读写方式写入。"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    configure_env
  fi
}

validate_compose() {
  print_header "校验 Docker Compose 配置"
  compose config >/dev/null
}

initialize_database() {
  print_header "初始化数据库结构和种子数据"
  compose run --rm --profile tools server-init
  touch "$INIT_MARKER_FILE"
}

deploy_up() {
  ensure_env_file
  validate_compose

  print_header "启动生产基础设施"
  compose up -d traefik postgres redis minio

  if [[ ! -f "$INIT_MARKER_FILE" ]]; then
    initialize_database
  else
    echo "检测到已初始化标记，跳过数据库初始化。"
    echo "如需重新初始化，可执行：bash scripts/deploy-production.sh reinit"
  fi

  print_header "构建并启动业务服务"
  compose up -d --build server web

  show_status
  print_header "部署完成"
  echo "访问地址: https://$(grep '^LABVAULT_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
  echo "如首次解析域名或申请证书，HTTPS 生效可能需要等待几十秒。"
}

deploy_down() {
  if [[ ! -f "$ENV_FILE" ]]; then
    print_error "未找到 $ENV_FILE，无法停止生产栈"
    exit 1
  fi

  print_header "停止生产服务"
  compose down
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
  print_header "启动数据库依赖"
  compose up -d postgres
  initialize_database
}

usage() {
  cat <<'EOF'
用法:
  bash scripts/deploy-production.sh [up|down|status|logs|configure|reinit]

说明:
  up         首次或日常一键部署生产环境
  down       停止生产环境
  status     查看当前容器状态
  logs       跟随查看容器日志
  configure  重新生成 .env.production
  reinit     重新执行数据库初始化
EOF
}

main() {
  require_command docker
  require_docker_compose

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
      fi
      configure_env
      ;;
    reinit)
      reinitialize
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${1:-up}"
