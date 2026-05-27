import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuditLogStatus, GroupType, UserStatus } from '../generated/prisma';
import { MailcowService } from '../mailcow/mailcow.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../security/audit-log.service';
import {
  AUTH_TOKEN_TTL_SECONDS,
  DIRECTION_ADMIN_ROLE_CODE,
  DIRECTION_ADMIN_WORKSPACE_ID,
  GRADE_ADMIN_ROLE_CODE,
  GRADE_ADMIN_WORKSPACE_ID,
  LAB_ADMIN_WORKSPACE_ID,
  MEMBER_ROLE_CODE,
  MEMBER_WORKSPACE_ID,
  SYSTEM_ADMIN_WORKSPACE_ID,
} from './auth.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthenticatedUser,
  AuthTokenPayload,
} from './interfaces/authenticated-user.interface';
import { hashPassword, verifyPassword } from './password.util';

const authUserSelect = {
  id: true,
  username: true,
  email: true,
  realName: true,
  passwordHash: true,
  mustChangePassword: true,
  status: true,
  memberships: {
    select: {
      groupId: true,
      group: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  },
  roles: {
    select: {
      role: {
        select: {
          code: true,
        },
      },
    },
  },
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailcowService: MailcowService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
      select: authUserSelect,
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.passwordHash ||
      !(await verifyPassword(dto.password, user.passwordHash))
    ) {
      await this.auditLogService.record({
        action: 'AUTH_LOGIN',
        status: AuditLogStatus.FAILURE,
        summary: '账号登录失败',
        metadata: {
          identifier,
        },
      });
      throw new UnauthorizedException('账号或密码错误');
    }

    await this.auditLogService.record({
      actorId: user.id,
      action: 'AUTH_LOGIN',
      targetType: 'USER',
      targetId: user.id,
      summary: '账号登录成功',
      metadata: {
        identifier,
      },
    });

    return {
      accessToken: this.signToken(user.id),
      user: this.toAuthenticatedUser(user),
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.findActiveUserById(userId);

    return {
      user,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.passwordHash ||
      !(await verifyPassword(dto.currentPassword, user.passwordHash))
    ) {
      await this.auditLogService.record({
        actorId: user?.id ?? userId,
        action: 'AUTH_CHANGE_PASSWORD',
        status: AuditLogStatus.FAILURE,
        targetType: 'USER',
        targetId: user?.id ?? userId,
        summary: '修改密码失败',
      });
      throw new UnauthorizedException('当前密码错误');
    }

    const passwordHash = await hashPassword(dto.newPassword);

    if (this.mailcowService.isEnabled()) {
      await this.mailcowService.updateMailbox(user.email, {
        password: dto.newPassword,
        password2: dto.newPassword,
        force_pw_update: '0',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });

    await this.auditLogService.record({
      actorId: user.id,
      action: 'AUTH_CHANGE_PASSWORD',
      targetType: 'USER',
      targetId: user.id,
      summary: '修改密码成功',
    });

    return this.getCurrentUser(userId);
  }

  async authenticate(
    token: string,
    activeWorkspaceId?: string,
  ): Promise<AuthenticatedUser> {
    const payload = this.verifyToken(token);
    return this.findActiveUserById(payload.sub, activeWorkspaceId);
  }

  private async findActiveUserById(
    userId: string,
    activeWorkspaceId?: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });

    return this.ensureActiveUser(user, activeWorkspaceId);
  }

  private ensureActiveUser(
    user: {
      id: string;
      username: string | null;
      email: string;
      realName: string;
      passwordHash?: string | null;
      mustChangePassword: boolean;
      status: UserStatus;
      memberships: Array<{
        groupId: string;
        group: { id: string; name: string; type: GroupType };
      }>;
      roles: Array<{ role: { code: string } }>;
    } | null,
    activeWorkspaceId?: string,
  ): AuthenticatedUser {
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('账号不存在或尚未启用');
    }

    return this.toAuthenticatedUser(user, activeWorkspaceId);
  }

  private toAuthenticatedUser(user: {
    id: string;
    username: string | null;
    email: string;
    realName: string;
    mustChangePassword: boolean;
    status: UserStatus;
    memberships: Array<{
      groupId: string;
      group: { id: string; name: string; type: GroupType };
    }>;
    roles: Array<{ role: { code: string } }>;
  }, activeWorkspaceId?: string): AuthenticatedUser {
    const roleCodes = user.roles.map(({ role }) => role.code);
    this.ensureWorkspaceAccessible(roleCodes, activeWorkspaceId);
    const scopedRoleCodes = this.resolveWorkspaceRoleCodes(
      roleCodes,
      activeWorkspaceId,
    );
    const scopedMemberships = this.resolveWorkspaceMemberships(
      user.memberships,
      activeWorkspaceId,
      scopedRoleCodes,
    );

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      realName: user.realName,
      mustChangePassword: user.mustChangePassword,
      status: user.status,
      groupIds: scopedMemberships.map((membership) => membership.groupId),
      memberships: scopedMemberships.map((membership) => ({
        groupId: membership.groupId,
        group: {
          id: membership.group.id,
          name: membership.group.name,
          type: membership.group.type,
        },
      })),
      roleCodes: scopedRoleCodes,
    };
  }

  private ensureWorkspaceAccessible(
    roleCodes: string[],
    activeWorkspaceId?: string,
  ) {
    if (!activeWorkspaceId) {
      return;
    }

    const accessibleWorkspaceIds = this.resolveAccessibleWorkspaceIds(roleCodes);
    if (!accessibleWorkspaceIds.includes(activeWorkspaceId)) {
      throw new UnauthorizedException('当前工作身份无效，请重新选择');
    }
  }

  private resolveAccessibleWorkspaceIds(roleCodes: string[]) {
    const workspaceIds: string[] = [];

    if (roleCodes.includes('SUPER_ADMIN')) {
      workspaceIds.push(SYSTEM_ADMIN_WORKSPACE_ID);
    }

    if (roleCodes.includes('LAB_ADMIN')) {
      workspaceIds.push(LAB_ADMIN_WORKSPACE_ID);
    }

    if (roleCodes.includes(DIRECTION_ADMIN_ROLE_CODE)) {
      workspaceIds.push(DIRECTION_ADMIN_WORKSPACE_ID);
    }

    if (roleCodes.includes(GRADE_ADMIN_ROLE_CODE)) {
      workspaceIds.push(GRADE_ADMIN_WORKSPACE_ID);
    }

    if (roleCodes.includes(MEMBER_ROLE_CODE) || workspaceIds.length === 0) {
      workspaceIds.push(MEMBER_WORKSPACE_ID);
    }

    return workspaceIds;
  }

  private resolveWorkspaceRoleCodes(
    roleCodes: string[],
    activeWorkspaceId?: string,
  ) {
    switch (activeWorkspaceId) {
      case SYSTEM_ADMIN_WORKSPACE_ID:
        return roleCodes.includes('SUPER_ADMIN') ? ['SUPER_ADMIN'] : roleCodes;
      case LAB_ADMIN_WORKSPACE_ID:
        return roleCodes.includes('LAB_ADMIN') ? ['LAB_ADMIN'] : roleCodes;
      case DIRECTION_ADMIN_WORKSPACE_ID:
        return roleCodes.includes(DIRECTION_ADMIN_ROLE_CODE)
          ? [DIRECTION_ADMIN_ROLE_CODE]
          : roleCodes;
      case GRADE_ADMIN_WORKSPACE_ID:
        return roleCodes.includes(GRADE_ADMIN_ROLE_CODE)
          ? [GRADE_ADMIN_ROLE_CODE]
          : roleCodes;
      case MEMBER_WORKSPACE_ID:
        return roleCodes.includes(MEMBER_ROLE_CODE) ? [MEMBER_ROLE_CODE] : [];
      default:
        return roleCodes;
    }
  }

  private resolveWorkspaceMemberships(
    memberships: Array<{
      groupId: string;
      group: { id: string; name: string; type: GroupType };
    }>,
    activeWorkspaceId: string | undefined,
    scopedRoleCodes: string[],
  ) {
    switch (activeWorkspaceId) {
      case DIRECTION_ADMIN_WORKSPACE_ID:
        return scopedRoleCodes.includes(DIRECTION_ADMIN_ROLE_CODE)
          ? memberships.filter(
              (membership) => membership.group.type === GroupType.DIRECTION,
            )
          : memberships;
      case GRADE_ADMIN_WORKSPACE_ID:
        return scopedRoleCodes.includes(GRADE_ADMIN_ROLE_CODE)
          ? memberships.filter(
              (membership) => membership.group.type === GroupType.GRADE,
            )
          : memberships;
      default:
        return memberships;
    }
  }

  private signToken(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AuthTokenPayload = {
      sub: userId,
      iat: now,
      exp: now + AUTH_TOKEN_TTL_SECONDS,
    };
    const encodedPayload = this.encodeBase64Url(JSON.stringify(payload));
    const signature = this.createSignature(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  private verifyToken(token: string): AuthTokenPayload {
    const [encodedPayload, providedSignature] = token.split('.');

    if (!encodedPayload || !providedSignature) {
      throw new UnauthorizedException('登录状态无效，请重新登录');
    }

    const expectedSignature = this.createSignature(encodedPayload);
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('登录状态无效，请重新登录');
    }

    let payload: AuthTokenPayload;

    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as AuthTokenPayload;
    } catch {
      throw new UnauthorizedException('登录状态无效，请重新登录');
    }

    if (!payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('登录状态已过期，请重新登录');
    }

    return payload;
  }

  private createSignature(value: string): string {
    return createHmac('sha256', this.getTokenSecret())
      .update(value)
      .digest('base64url');
  }

  private getTokenSecret(): string {
    return process.env.AUTH_TOKEN_SECRET ?? '3glabvault-dev-secret';
  }

  private encodeBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }
}
