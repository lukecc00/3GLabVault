import {
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ADMIN_ROLE_CODES,
  GLOBAL_ADMIN_ROLE_CODES,
} from '../auth/auth.constants';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupService } from './group.service';
import { KnowledgeSpaceService } from '../knowledge-space/knowledge-space.service';

@Controller('groups')
@UseGuards(AuthGuard, RolesGuard)
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly knowledgeSpaceService: KnowledgeSpaceService,
  ) {}

  @Roles(...ADMIN_ROLE_CODES)
  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.groupService.findAll(currentUser);
  }

  @Roles(...GLOBAL_ADMIN_ROLE_CODES)
  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groupService.create(dto);
  }

  @Roles(...GLOBAL_ADMIN_ROLE_CODES)
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

  @Roles(...GLOBAL_ADMIN_ROLE_CODES)
  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() dto: AddGroupMemberDto) {
    return this.groupService.addMember(id, dto);
  }

  @Roles(...GLOBAL_ADMIN_ROLE_CODES)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groupService.remove(id);
  }
}
