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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BulkUpdateInternalMailMailboxDto } from './dto/bulk-update-internal-mail-mailbox.dto';
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
  getComposerOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.internalMailService.getComposerOptions(user);
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

  @Delete('trash')
  emptyTrash(@CurrentUser() user: AuthenticatedUser) {
    return this.internalMailService.emptyTrash(user);
  }

  @Get('messages/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.internalMailService.findOne(id, user);
  }

  @Post('messages')
  @Throttle({
    default: {
      ttl: 10 * 60_000,
      limit: 30,
    },
  })
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

  @Post('mailbox/bulk')
  bulkUpdateMailboxEntries(
    @Body() dto: BulkUpdateInternalMailMailboxDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.internalMailService.bulkUpdateMailboxEntries(dto, user);
  }
}
