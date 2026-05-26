import { Module } from '@nestjs/common';
import { InternalMailController } from './internal-mail.controller';
import { InternalMailService } from './internal-mail.service';

@Module({
  controllers: [InternalMailController],
  providers: [InternalMailService],
  exports: [InternalMailService],
})
export class InternalMailModule {}
