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
import { CreateInternalMailDto } from './dto/create-internal-mail.dto';
import { QueryInternalMailListDto } from './dto/query-internal-mail-list.dto';
import { UpdateInternalMailMailboxDto } from './dto/update-internal-mail-mailbox.dto';
import { InternalMailService } from './internal-mail.service';

@Controller('internal-mail')
@UseGuards(AuthGuard)
export class InternalMailController {
  constructor(private readonly internalMailService: InternalMailService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.internalMailService.getSummary(user);
  }

  @Get('composer/options')
  getComposerOptions() {
    return this.internalMailService.getComposerOptions();
  }

  @Get('inbox')
  getInbox(
    @Query() query: QueryInternalMailListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.getInbox(user, query);
  }

  @Get('sent')
  getSent(
    @Query() query: QueryInternalMailListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.getSent(user, query);
  }

  @Get('drafts')
  getDrafts(
    @Query() query: QueryInternalMailListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.getDrafts(user, query);
  }

  @Get('archive')
  getArchive(
    @Query() query: QueryInternalMailListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.getArchive(user, query);
  }

  @Get('trash')
  getTrash(
    @Query() query: QueryInternalMailListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.getTrash(user, query);
  }

  @Get('messages/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.internalMailService.findOne(id, user);
  }

  @Post('messages')
  create(
    @Body() dto: CreateInternalMailDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.create(dto, user);
  }

  @Patch('mailbox/:id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.internalMailService.markMailboxEntryAsRead(id, user);
  }

  @Patch('mailbox/:id')
  updateMailboxEntry(
    @Param('id') id: string,
    @Body() dto: UpdateInternalMailMailboxDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.updateMailboxEntry(id, dto, user);
  }
}
