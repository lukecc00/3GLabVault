import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ACTIVE_WORKSPACE_HEADER } from '../auth.constants';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string; [ACTIVE_WORKSPACE_HEADER]?: string | string[] };
      user?: AuthenticatedUser;
    }>();
    const authorization = request.headers.authorization;
    const activeWorkspaceHeader = request.headers[ACTIVE_WORKSPACE_HEADER];

    if (!authorization) {
      throw new UnauthorizedException('请先登录');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('无效的认证信息');
    }

    if (Array.isArray(activeWorkspaceHeader)) {
      throw new BadRequestException('工作身份请求头格式无效');
    }

    request.user = await this.authService.authenticate(token, activeWorkspaceHeader);
    return true;
  }
}
