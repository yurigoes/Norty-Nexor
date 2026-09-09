import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SlaJobs } from './sla.jobs';
import { SlaService } from './sla.service';

@Module({
  imports: [WebhooksModule, forwardRef(() => ChannelsModule)],
  providers: [SlaService, SlaJobs],
  exports: [SlaService, SlaJobs],
})
export class SlaModule {}
