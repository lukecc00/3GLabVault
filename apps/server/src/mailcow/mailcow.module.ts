import { Global, Module } from '@nestjs/common';
import { MailcowService } from './mailcow.service';

@Global()
@Module({
  providers: [MailcowService],
  exports: [MailcowService],
})
export class MailcowModule {}
