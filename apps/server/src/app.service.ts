import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus(): { name: string; status: 'ok'; timestamp: string } {
    return {
      name: '3GLabVault API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
