import { Module } from '@nestjs/common';
import { InternalMailController } from './internal-mail.controller';
import { ExternalMailReminderService } from './external-mail-reminder.service';
import { InternalMailService } from './internal-mail.service';

@Module({
  controllers: [InternalMailController],
  providers: [InternalMailService, ExternalMailReminderService],
  exports: [InternalMailService, ExternalMailReminderService],
})
export class InternalMailModule {}
