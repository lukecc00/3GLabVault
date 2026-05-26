export const AUTH_ROLES_KEY = 'auth:roles';

export const ADMIN_ROLE_CODES = [
  'SUPER_ADMIN',
  'LAB_ADMIN',
  'DIRECTION_ADMIN',
  'GRADE_ADMIN',
] as const;

export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 12;
