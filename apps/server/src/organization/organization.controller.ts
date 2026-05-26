import { Controller, Get, UseGuards } from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationService } from './organization.service';

@Controller('organizations')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_CODES)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('summary')
  getSummary() {
    return this.organizationService.getSummary();
  }
}
