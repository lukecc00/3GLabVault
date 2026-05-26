import { Module } from '@nestjs/common';
import { KnowledgeSpaceModule } from '../knowledge-space/knowledge-space.module';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';

@Module({
  imports: [KnowledgeSpaceModule],
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}
