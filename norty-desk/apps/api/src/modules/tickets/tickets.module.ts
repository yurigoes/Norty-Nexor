import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { SlaModule } from '../sla/sla.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [SlaModule, forwardRef(() => ChannelsModule)],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
