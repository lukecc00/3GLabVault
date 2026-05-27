import { Injectable, Logger } from '@nestjs/common';
import { AuditLogStatus, Prisma } from '../generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { FindAuditLogsDto } from './dto/find-audit-logs.dto';
import { RequestContextService } from './request-context.service';

interface RecordAuditLogInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  status?: AuditLogStatus;
  summary: string;
  metadata?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async record(input: RecordAuditLogInput) {
    const context = this.requestContextService.get();

    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          status: input.status ?? AuditLogStatus.SUCCESS,
          summary: input.summary,
          metadata: input.metadata ?? undefined,
          ipAddress: context?.ipAddress,
          countryCode: context?.countryCode,
          userAgent: context?.userAgent,
          workspaceId: context?.workspaceId,
        },
      });
    } catch (error) {
      this.logger.error(
        `审计日志写入失败: ${input.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll(query: FindAuditLogsDto, _currentUser: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;
    const startAt = query.startAt ? new Date(query.startAt) : null;
    const endAt = query.endAt ? new Date(query.endAt) : null;
    const normalizedCountryCode = query.countryCode?.trim().toUpperCase();
    const normalizedAction = query.action?.trim();
    const normalizedTargetType = query.targetType?.trim().toUpperCase();
    const normalizedResourceKeyword = query.resourceKeyword?.trim();
    const normalizedIpAddress = query.ipAddress?.trim();
    const normalizedActorId = query.actorId?.trim();

    const where: Prisma.AuditLogWhereInput = {
      ...(normalizedActorId ? { actorId: normalizedActorId } : null),
      ...(normalizedIpAddress
        ? { ipAddress: { contains: normalizedIpAddress, mode: 'insensitive' } }
        : null),
      ...(normalizedCountryCode ? { countryCode: normalizedCountryCode } : null),
      ...(normalizedAction
        ? { action: { contains: normalizedAction, mode: 'insensitive' } }
        : null),
      ...(normalizedTargetType
        ? { targetType: { equals: normalizedTargetType, mode: 'insensitive' } }
        : null),
      ...(normalizedResourceKeyword
        ? {
            OR: [
              { targetId: { contains: normalizedResourceKeyword, mode: 'insensitive' } },
              { summary: { contains: normalizedResourceKeyword, mode: 'insensitive' } },
              { action: { contains: normalizedResourceKeyword, mode: 'insensitive' } },
            ],
          }
        : null),
      ...(startAt || endAt
        ? {
            createdAt: {
              ...(startAt ? { gte: startAt } : null),
              ...(endAt ? { lte: endAt } : null),
            },
          }
        : null),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
        include: {
          actor: {
            select: {
              id: true,
              realName: true,
              email: true,
              username: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    };
  }
}
