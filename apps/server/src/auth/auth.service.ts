import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { UserStatus } from '../generated/prisma';
import { MailcowService } from '../mailcow/mailcow.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_TOKEN_TTL_SECONDS } from './auth.constants';
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
  archivedAt: true,
  memberships: {
    select: {
      groupId: true,
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
      user.archivedAt !== null ||
      !user.passwordHash ||
      !(await verifyPassword(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('账号或密码错误');
    }

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
      user.archivedAt !== null ||
      !user.passwordHash ||
      !(await verifyPassword(dto.currentPassword, user.passwordHash))
    ) {
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

    return this.getCurrentUser(userId);
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const payload = this.verifyToken(token);
    return this.findActiveUserById(payload.sub);
  }

  private async findActiveUserById(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });

    return this.ensureActiveUser(user);
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
      archivedAt: Date | null;
      memberships: Array<{ groupId: string }>;
      roles: Array<{ role: { code: string } }>;
    } | null,
  ): AuthenticatedUser {
    if (!user || user.status !== UserStatus.ACTIVE || user.archivedAt !== null) {
      throw new UnauthorizedException('账号不存在或尚未启用');
    }

    return this.toAuthenticatedUser(user);
  }

  private toAuthenticatedUser(user: {
    id: string;
    username: string | null;
    email: string;
    realName: string;
    mustChangePassword: boolean;
    status: UserStatus;
    memberships: Array<{ groupId: string }>;
    roles: Array<{ role: { code: string } }>;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      realName: user.realName,
      mustChangePassword: user.mustChangePassword,
      status: user.status,
      groupIds: user.memberships.map((membership) => membership.groupId),
      roleCodes: user.roles.map(({ role }) => role.code),
    };
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
