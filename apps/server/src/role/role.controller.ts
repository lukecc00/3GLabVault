import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleService } from './role.service';

@Controller('roles')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_CODES)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  findAll() {
    return this.roleService.findAll();
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }
}
