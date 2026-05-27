import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ACTIVE_WORKSPACE_HEADER } from '../auth/auth.constants';
import { RequestContextService } from './request-context.service';

const DEFAULT_COUNTRY_HEADERS = [
  'cf-ipcountry',
  'x-country-code',
  'x-geo-country',
  'x-vercel-ip-country',
] as const;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const requestId = this.resolveHeaderValue(request, 'x-request-id') || randomUUID();
    const context = {
      requestId,
      ipAddress: this.resolveClientIp(request),
      countryCode: this.resolveCountryCode(request),
      userAgent: this.resolveHeaderValue(request, 'user-agent'),
      workspaceId: this.resolveHeaderValue(request, ACTIVE_WORKSPACE_HEADER),
    };

    response.setHeader('X-Request-Id', requestId);
    this.requestContextService.run(context, () => next());
  }

  private resolveCountryCode(request: Request) {
    const configuredHeader = process.env.ACCESS_COUNTRY_HEADER?.trim().toLowerCase();
    const headerNames = configuredHeader
      ? [configuredHeader]
      : [...DEFAULT_COUNTRY_HEADERS];

    for (const headerName of headerNames) {
      const value = this.resolveHeaderValue(request, headerName);
      if (value) {
        return value.toUpperCase();
      }
    }

    return undefined;
  }

  private resolveClientIp(request: Request) {
    const forwardedFor = this.resolveHeaderValue(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim().replace(/^::ffff:/i, '');
    }

    const realIp = this.resolveHeaderValue(request, 'x-real-ip');
    if (realIp) {
      return realIp.replace(/^::ffff:/i, '');
    }

    return request.ip?.replace(/^::ffff:/i, '') || undefined;
  }

  private resolveHeaderValue(request: Request, headerName: string) {
    const rawValue = request.headers[headerName.toLowerCase()];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const normalizedValue = value?.trim();
    return normalizedValue || undefined;
  }
}
