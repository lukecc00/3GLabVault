import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KnowledgePageService } from './knowledge-page.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('knowledge/pages')
@UseGuards(AuthGuard)
export class KnowledgePageController {
  constructor(private readonly knowledgePageService: KnowledgePageService) {}

  @Get()
  findAll(
    @Query('spaceId') spaceId: string | undefined,
    @Query('q') query: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.findAll(spaceId, query, user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('archived')
  findArchived() {
    return this.knowledgePageService.findArchived();
  }

  @Get('assets')
  async getImageAsset(
    @Query('spaceId') spaceId: string,
    @Query('key') key: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const asset = await this.knowledgePageService.getImageAsset(spaceId, key, user);

    response.setHeader('Content-Type', asset.contentType);
    response.setHeader(
      'Cache-Control',
      asset.cacheControl ?? 'private, max-age=31536000, immutable',
    );

    if (asset.contentLength) {
      response.setHeader('Content-Length', String(asset.contentLength));
    }

    if (asset.etag) {
      response.setHeader('ETag', asset.etag);
    }

    return new StreamableFile(asset.stream);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgePageService.findOne(id, user);
  }

  @Get(':id/permissions')
  findPermissionManagement(
    @Param('id') id: string,
    @Query('q') query: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.findPermissionManagement(id, query, user);
  }

  @Post()
  create(
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.create(dto, user);
  }

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 3 * 1024 * 1024,
      },
    }),
  )
  uploadImage(
    @Body('spaceId') spaceId: string,
    @UploadedFile()
    file:
      | {
          originalname: string;
          mimetype: string;
          size: number;
          buffer: Buffer;
        }
      | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.uploadImage(spaceId, file, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgePageService.remove(id, user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.knowledgePageService.restore(id);
  }

  @Post(':id/permissions')
  grantPermission(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.grantPermission(id, dto, user);
  }

  @Delete(':id/permissions/:userId')
  revokePermission(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgePageService.revokePermission(id, userId, user);
  }
}
