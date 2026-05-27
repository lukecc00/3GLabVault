import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KnowledgeSpaceService } from './knowledge-space.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('knowledge/spaces')
@UseGuards(AuthGuard)
export class KnowledgeSpaceController {
  constructor(private readonly knowledgeSpaceService: KnowledgeSpaceService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeSpaceService.findAll(user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('archived')
  findArchived() {
    return this.knowledgeSpaceService.findArchived();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeSpaceService.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgeSpaceService.create(dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeSpaceService.remove(id, user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.knowledgeSpaceService.restore(id);
  }

  @Post(':id/access-groups')
  grantAccessGroup(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgeSpaceService.grantAccessGroup(id, dto, user);
  }

  @Delete(':id/access-groups/:groupId')
  revokeAccessGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgeSpaceService.revokeAccessGroup(id, groupId, user);
  }
}
