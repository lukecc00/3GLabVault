import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CreateKnowledgePageDto } from './dto/create-knowledge-page.dto';
import { UpdateKnowledgePageDto } from './dto/update-knowledge-page.dto';
import { KnowledgePageService } from './knowledge-page.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('knowledge/pages')
@UseGuards(AuthGuard)
export class KnowledgePageController {
  constructor(private readonly knowledgePageService: KnowledgePageService) {}

  @Get()
  findAll(
    @Query('spaceId') spaceId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.findAll(spaceId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgePageService.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateKnowledgePageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgePageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgePageService.remove(id, user);
  }
}
