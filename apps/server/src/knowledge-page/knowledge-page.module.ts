import { Module } from '@nestjs/common';
import { InternalMailModule } from '../internal-mail/internal-mail.module';
import { KnowledgeSpaceModule } from '../knowledge-space/knowledge-space.module';
import { StorageModule } from '../storage/storage.module';
import { KnowledgePageController } from './knowledge-page.controller';
import { KnowledgePageService } from './knowledge-page.service';

@Module({
  imports: [InternalMailModule, StorageModule, KnowledgeSpaceModule],
  controllers: [KnowledgePageController],
  providers: [KnowledgePageService],
  exports: [KnowledgePageService],
})
export class KnowledgePageModule {}
