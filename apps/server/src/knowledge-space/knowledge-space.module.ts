import { Module } from '@nestjs/common';
import { KnowledgeSpaceController } from './knowledge-space.controller';
import { KnowledgeSpaceService } from './knowledge-space.service';

@Module({
  controllers: [KnowledgeSpaceController],
  providers: [KnowledgeSpaceService],
  exports: [KnowledgeSpaceService],
})
export class KnowledgeSpaceModule {}
