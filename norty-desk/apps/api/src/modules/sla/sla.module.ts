import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { SlaJobs } from './sla.jobs';
import { SlaService } from './sla.service';

@Module({
  imports: [forwardRef(() => ChannelsModule)],
  providers: [SlaService, SlaJobs],
  exports: [SlaService, SlaJobs],
})
export class SlaModule {}
