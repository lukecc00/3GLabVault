import { Module } from '@nestjs/common';
import { InternalMailModule } from '../internal-mail/internal-mail.module';
import { KnowledgePageAccessRequestController } from './knowledge-page-access-request.controller';
import { KnowledgePageAccessRequestService } from './knowledge-page-access-request.service';

@Module({
  imports: [InternalMailModule],
  controllers: [KnowledgePageAccessRequestController],
  providers: [KnowledgePageAccessRequestService],
  exports: [KnowledgePageAccessRequestService],
})
export class KnowledgePageAccessRequestModule {}
