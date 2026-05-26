import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupService } from './group.service';
import { KnowledgeSpaceService } from '../knowledge-space/knowledge-space.service';

@Controller('groups')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_CODES)
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly knowledgeSpaceService: KnowledgeSpaceService,
  ) {}

  @Get()
  findAll() {
    return this.groupService.findAll();
  }

  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groupService.create(dto);
  }

  @Post('bootstrap-directions')
  async bootstrapDirections() {
    const groupResult = await this.groupService.bootstrapDirections();
    const spaceResult =
      await this.knowledgeSpaceService.bootstrapDirectionSpaces();

    return {
      createdGroupCount: groupResult.createdCount,
      updatedGroupCount: groupResult.updatedCount,
      createdSpaceCount: spaceResult.createdCount,
      updatedSpaceCount: spaceResult.updatedCount,
      groups: groupResult.groups,
      spaces: spaceResult.spaces,
    };
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() dto: AddGroupMemberDto) {
    return this.groupService.addMember(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groupService.remove(id);
  }
}
