import { ConflictException, Injectable } from '@nestjs/common';
import {
  GLOBAL_ADMIN_ROLE_CODES,
  GRADE_ADMIN_ROLE_CODE,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(currentUser?: AuthenticatedUser) {
    return this.prisma.role.findMany({
      where: this.buildScopedRoleWhere(currentUser),
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  private buildScopedRoleWhere(
    currentUser?: AuthenticatedUser,
  ) {
    if (!currentUser || this.hasGlobalAdminRole(currentUser.roleCodes)) {
      return undefined;
    }

    if (currentUser.roleCodes.includes(GRADE_ADMIN_ROLE_CODE)) {
      return {
        code: {
          in: ['MEMBER', GRADE_ADMIN_ROLE_CODE],
        },
      };
    }

    return undefined;
  }

  private hasGlobalAdminRole(roleCodes: string[]) {
    return roleCodes.some((roleCode) =>
      GLOBAL_ADMIN_ROLE_CODES.includes(
        roleCode as (typeof GLOBAL_ADMIN_ROLE_CODES)[number],
      ),
    );
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: {
        code: dto.code,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('角色编码已存在');
    }

    return this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isSystem: dto.isSystem ?? false,
      },
    });
  }
}
