import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const forwardedFor = this.getHeader(req, 'x-forwarded-for');
    if (forwardedFor) {
      const [clientIp] = forwardedFor.split(',');
      const normalizedIp = clientIp?.trim();

      if (normalizedIp) {
        return normalizedIp;
      }
    }

    const realIp = this.getHeader(req, 'x-real-ip');
    if (realIp) {
      return realIp.trim();
    }

    const cfConnectingIp = this.getHeader(req, 'cf-connecting-ip');
    if (cfConnectingIp) {
      return cfConnectingIp.trim();
    }

    const ips = Array.isArray(req.ips) ? req.ips : [];
    const firstIp = ips.find(
      (ip): ip is string => typeof ip === 'string' && ip.trim().length > 0,
    );
    if (firstIp) {
      return firstIp.trim();
    }

    if (typeof req.ip === 'string' && req.ip.trim().length > 0) {
      return req.ip.trim();
    }

    return 'unknown';
  }

  private getHeader(req: Record<string, unknown>, name: string) {
    const headers =
      req.headers && typeof req.headers === 'object'
        ? (req.headers as Record<string, unknown>)
        : null;
    const value = headers?.[name];

    return typeof value === 'string' ? value : null;
  }
}
