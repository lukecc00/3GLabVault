import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ADMIN_ROLE_CODES,
  GLOBAL_ADMIN_ROLE_CODES,
} from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleService } from './role.service';

@Controller('roles')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_CODES)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Roles(...ADMIN_ROLE_CODES)
  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.roleService.findAll(currentUser);
  }

  @Roles(...GLOBAL_ADMIN_ROLE_CODES)
  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }
}
