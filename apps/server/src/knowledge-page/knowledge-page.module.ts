import { Module } from '@nestjs/common';
import { KnowledgePageController } from './knowledge-page.controller';
import { KnowledgePageService } from './knowledge-page.service';

@Module({
  controllers: [KnowledgePageController],
  providers: [KnowledgePageService],
  exports: [KnowledgePageService],
})
export class KnowledgePageModule {}
