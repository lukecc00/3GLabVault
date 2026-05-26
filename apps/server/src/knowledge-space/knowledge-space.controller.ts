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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateKnowledgeSpaceDto } from './dto/create-knowledge-space.dto';
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

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeSpaceService.findOne(id, user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Post()
  create(@Body() dto: CreateKnowledgeSpaceDto) {
    return this.knowledgeSpaceService.create(dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledgeSpaceService.remove(id);
  }
}
