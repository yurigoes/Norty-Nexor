import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ConfiguracaoSlaController } from './configuracao.controller';
import { ConfiguracaoSlaService } from './configuracao.service';
import { SlaJobs } from './sla.jobs';
import { SlaService } from './sla.service';

@Module({
  imports: [WebhooksModule, forwardRef(() => ChannelsModule)],
  controllers: [ConfiguracaoSlaController],
  providers: [SlaService, SlaJobs, ConfiguracaoSlaService],
  exports: [SlaService, SlaJobs],
})
export class SlaModule {}
