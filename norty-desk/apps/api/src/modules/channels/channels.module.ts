import { Module } from '@nestjs/common';

import { EmailController } from './email.controller';
import { EntradaService } from './entrada.service';
import { EvolutionClient } from './evolution.client';
import { WhatsappController } from './whatsapp.controller';

@Module({
  controllers: [EmailController, WhatsappController],
  providers: [EntradaService, EvolutionClient],
  exports: [EntradaService, EvolutionClient],
})
export class ChannelsModule {}
