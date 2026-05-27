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
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BatchGenerateUsersDto } from './dto/batch-generate-users.dto';
import { CheckRegisterPrefixDto } from './dto/check-register-prefix.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { FindUsersDirectoryDto } from './dto/find-users-directory.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { RestoreArchivedContentDto } from './dto/restore-archived-content.dto';
import { ReviewUserDto } from './dto/review-user.dto';
import { UpdateUserGroupAssignmentsDto } from './dto/update-user-group-assignments.dto';
import { UpdateUserRoleAssignmentsDto } from './dto/update-user-role-assignments.dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('register/options')
  getRegisterOptions() {
    return this.userService.getRegisterOptions();
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: 30,
    },
  })
  @Post('register/prefix-check')
  checkRegisterPrefix(@Body() dto: CheckRegisterPrefixDto) {
    return this.userService.checkRegisterPrefix(dto.namePinyin);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Get('directory')
  findDirectory(
    @Query() query: FindUsersDirectoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.findDirectory(query, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.userService.findAll(currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Get('archived')
  findArchived(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.userService.findArchived(currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.findOne(id, currentUser);
  }

  @Throttle({
    default: {
      ttl: 10 * 60_000,
      limit: 5,
    },
  })
  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return this.userService.register(dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 10,
    },
  })
  @Post('batch-generate')
  batchGenerate(
    @Body() dto: BatchGenerateUsersDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.batchGenerate(dto, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.review(id, dto, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 8,
    },
  })
  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.resetPassword(id, dto, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Patch(':id/roles')
  updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleAssignmentsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.updateRoles(id, dto, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Patch(':id/groups')
  updateGroups(
    @Param('id') id: string,
    @Body() dto: UpdateUserGroupAssignmentsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.updateGroups(id, dto, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Post(':id/archive')
  archive(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.archive(id, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Post(':id/restore-content')
  restoreContent(
    @Param('id') id: string,
    @Body() dto: RestoreArchivedContentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.restoreArchivedContent(id, dto, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Post(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.reactivate(id, currentUser);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.remove(id, currentUser);
  }
}
