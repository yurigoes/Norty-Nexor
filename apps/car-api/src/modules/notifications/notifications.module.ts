import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OutboxService } from './outbox.service';
import { SchedulerService } from './scheduler.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, OutboxService, SchedulerService],
  exports: [SchedulerService, OutboxService],
})
export class NotificationsModule {}
