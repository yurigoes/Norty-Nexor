import { Module } from '@nestjs/common';

import { WebhooksModule } from '../webhooks/webhooks.module';
import { ProblemasController } from './problemas.controller';
import { ProblemasService } from './problemas.service';

@Module({
  imports: [WebhooksModule],
  controllers: [ProblemasController],
  providers: [ProblemasService],
  exports: [ProblemasService],
})
export class ProblemasModule {}
