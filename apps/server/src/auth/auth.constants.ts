export const AUTH_ROLES_KEY = 'auth:roles';
export const ACTIVE_WORKSPACE_HEADER = 'x-active-workspace';

export const GLOBAL_ADMIN_ROLE_CODES = [
  'SUPER_ADMIN',
  'LAB_ADMIN',
  'DIRECTION_ADMIN',
] as const;

export const SCOPED_ADMIN_ROLE_CODES = [
  'GRADE_ADMIN',
] as const;

export const ADMIN_ROLE_CODES = [
  ...GLOBAL_ADMIN_ROLE_CODES,
  ...SCOPED_ADMIN_ROLE_CODES,
] as const;

export const DIRECTION_ADMIN_ROLE_CODE = 'DIRECTION_ADMIN' as const;
export const GRADE_ADMIN_ROLE_CODE = 'GRADE_ADMIN' as const;
export const MEMBER_ROLE_CODE = 'MEMBER' as const;

export const SYSTEM_ADMIN_WORKSPACE_ID = 'system-admin' as const;
export const LAB_ADMIN_WORKSPACE_ID = 'lab-admin' as const;
export const DIRECTION_ADMIN_WORKSPACE_ID = 'direction-admin' as const;
export const GRADE_ADMIN_WORKSPACE_ID = 'grade-admin' as const;
export const MEMBER_WORKSPACE_ID = 'member' as const;

export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 12;
