import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  providers: [RequestContextService, AuditLogService],
  exports: [RequestContextService, AuditLogService],
})
export class SecurityModule {}
