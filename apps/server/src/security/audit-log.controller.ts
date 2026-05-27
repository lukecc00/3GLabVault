import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GLOBAL_ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from './audit-log.service';
import { FindAuditLogsDto } from './dto/find-audit-logs.dto';

@Controller('audit-logs')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...GLOBAL_ADMIN_ROLE_CODES)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(
    @Query() query: FindAuditLogsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.auditLogService.findAll(query, currentUser);
  }
}
