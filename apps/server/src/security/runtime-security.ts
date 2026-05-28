import { Logger } from '@nestjs/common';

const logger = new Logger('RuntimeSecurity');
const INSECURE_EXACT_VALUES = new Set([
  '',
  'change-me-for-local-dev',
  '3glabvault-dev-secret',
  'minioadmin',
  'minioadmin123',
]);

function normalizeEnvValue(value: string | undefined) {
  return value?.trim() ?? '';
}

function isProductionEnvironment() {
  return normalizeEnvValue(process.env.NODE_ENV).toLowerCase() === 'production';
}

function hasMinimumLength(value: string, minimumLength: number) {
  return value.length >= minimumLength;
}

function isWildcardCorsOrigin(value: string) {
  return value === '*' || value.includes(',*') || value.startsWith('*,');
}

export function assertSecureRuntimeConfig() {
  const production = isProductionEnvironment();
  const warnings: string[] = [];
  const errors: string[] = [];

  const authTokenSecret = normalizeEnvValue(process.env.AUTH_TOKEN_SECRET);
  if (!hasMinimumLength(authTokenSecret, 32)) {
    const message = 'AUTH_TOKEN_SECRET 长度至少需要 32 位';
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }
  if (INSECURE_EXACT_VALUES.has(authTokenSecret)) {
    const message = 'AUTH_TOKEN_SECRET 不能使用默认弱口令';
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const adminInitialPassword = normalizeEnvValue(process.env.ADMIN_INITIAL_PASSWORD);
  if (!adminInitialPassword) {
    warnings.push('ADMIN_INITIAL_PASSWORD 未配置，首次初始化管理员前请确认部署流程已显式注入');
  } else if (INSECURE_EXACT_VALUES.has(adminInitialPassword)) {
    const message = 'ADMIN_INITIAL_PASSWORD 不能使用仓库默认弱口令';
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const minioAccessKey = normalizeEnvValue(process.env.MINIO_ACCESS_KEY);
  const minioSecretKey = normalizeEnvValue(process.env.MINIO_SECRET_KEY);
  if (
    INSECURE_EXACT_VALUES.has(minioAccessKey) ||
    INSECURE_EXACT_VALUES.has(minioSecretKey)
  ) {
    const message = 'MINIO_ACCESS_KEY / MINIO_SECRET_KEY 不能使用默认凭据';
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const corsOrigin = normalizeEnvValue(process.env.CORS_ORIGIN);
  if (corsOrigin && isWildcardCorsOrigin(corsOrigin)) {
    const message = 'CORS_ORIGIN 不能配置为通配符 *';
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const allowedCountries = normalizeEnvValue(process.env.ACCESS_ALLOWED_COUNTRIES);
  const countryHeader = normalizeEnvValue(process.env.ACCESS_COUNTRY_HEADER);
  if (allowedCountries && !countryHeader) {
    warnings.push(
      '已配置 ACCESS_ALLOWED_COUNTRIES，但未配置 ACCESS_COUNTRY_HEADER，海外访问拦截将无法生效',
    );
  }

  warnings.forEach((message) => logger.warn(message));

  if (errors.length > 0) {
    throw new Error(`安全配置校验失败:\n- ${errors.join('\n- ')}`);
  }
}
