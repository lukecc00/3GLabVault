import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FindKnowledgePageAccessRequestsDto } from './dto/find-knowledge-page-access-requests.dto';
import { KnowledgePageAccessRequestService } from './knowledge-page-access-request.service';

@Controller('knowledge/page-access-requests')
@UseGuards(AuthGuard)
export class KnowledgePageAccessRequestController {
  constructor(
    private readonly knowledgePageAccessRequestService: KnowledgePageAccessRequestService,
  ) {}

  @Get()
  findDashboard(
    @Query() query: FindKnowledgePageAccessRequestsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageAccessRequestService.findDashboard(query, user);
  }

  @Post()
  create(
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageAccessRequestService.create(dto, user);
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageAccessRequestService.review(id, dto, user);
  }
}
