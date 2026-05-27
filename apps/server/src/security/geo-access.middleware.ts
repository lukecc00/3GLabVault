import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const DEFAULT_COUNTRY_HEADERS = [
  'cf-ipcountry',
  'x-country-code',
  'x-geo-country',
  'x-vercel-ip-country',
] as const;
const PRIVATE_IPV4_PREFIXES = ['10.', '127.', '192.168.', '169.254.'];
const PRIVATE_IPV6_PREFIXES = ['::1', 'fc', 'fd', 'fe80'];

@Injectable()
export class GeoAccessMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GeoAccessMiddleware.name);

  use(request: Request, response: Response, next: NextFunction) {
    const allowedCountries = this.resolveAllowedCountries();
    if (allowedCountries.length === 0) {
      next();
      return;
    }

    const clientIp = this.resolveClientIp(request);
    if (this.isPrivateOrLoopbackIp(clientIp)) {
      next();
      return;
    }

    const countryCode = this.resolveCountryCode(request);
    const strictMode = this.isStrictModeEnabled();

    if (!countryCode) {
      if (!strictMode) {
        next();
        return;
      }

      this.logger.warn(
        `阻止缺少国家信息的请求: ${request.method} ${request.originalUrl} ip=${clientIp}`,
      );
      response.status(403).json({
        statusCode: 403,
        message: '当前地区暂不允许访问',
      });
      return;
    }

    if (!allowedCountries.includes(countryCode)) {
      this.logger.warn(
        `阻止非允许地区访问: ${request.method} ${request.originalUrl} ip=${clientIp} country=${countryCode}`,
      );
      response.status(403).json({
        statusCode: 403,
        message: '当前地区暂不允许访问',
      });
      return;
    }

    next();
  }

  private resolveAllowedCountries() {
    return (process.env.ACCESS_ALLOWED_COUNTRIES ?? '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
  }

  private resolveCountryCode(request: Request) {
    const configuredHeader = process.env.ACCESS_COUNTRY_HEADER?.trim().toLowerCase();
    const headerNames = configuredHeader
      ? [configuredHeader]
      : [...DEFAULT_COUNTRY_HEADERS];

    for (const headerName of headerNames) {
      const headerValue = request.headers[headerName];
      const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      const normalizedValue = value?.trim().toUpperCase();

      if (normalizedValue) {
        return normalizedValue;
      }
    }

    return '';
  }

  private isStrictModeEnabled() {
    return (process.env.ACCESS_COUNTRY_STRICT ?? 'false').trim().toLowerCase() === 'true';
  }

  private resolveClientIp(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    const forwardedIp = forwardedValue?.split(',')[0]?.trim();
    if (forwardedIp) {
      return this.normalizeIp(forwardedIp);
    }

    const realIp = request.headers['x-real-ip'];
    const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp;
    if (realIpValue?.trim()) {
      return this.normalizeIp(realIpValue.trim());
    }

    return this.normalizeIp(request.ip || '');
  }

  private normalizeIp(value: string) {
    return value.replace(/^::ffff:/i, '').trim().toLowerCase();
  }

  private isPrivateOrLoopbackIp(ip: string) {
    if (!ip) {
      return false;
    }

    if (PRIVATE_IPV4_PREFIXES.some((prefix) => ip.startsWith(prefix))) {
      return true;
    }

    return PRIVATE_IPV6_PREFIXES.some((prefix) => ip.startsWith(prefix));
  }
}
