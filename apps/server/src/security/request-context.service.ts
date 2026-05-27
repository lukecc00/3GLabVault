import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextState {
  requestId: string;
  ipAddress?: string;
  countryCode?: string;
  userAgent?: string;
  workspaceId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run<T>(context: RequestContextState, callback: () => T) {
    return this.storage.run(context, callback);
  }

  get() {
    return this.storage.getStore();
  }
}
