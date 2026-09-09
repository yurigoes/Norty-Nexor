import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AttachmentsModule } from '../attachments/attachments.module';
import { RegrasModule } from '../regras/regras.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PORTAS_DE_ENVIO, type PortasDeEnvio } from './canais.tokens';
import { ProcessamentoService } from './processamento.service';
import { DespachoJob } from './despacho.job';
import { EmailController } from './email.controller';
import { EntradaService } from './entrada.service';
import { EvolutionClient } from './evolution.client';
import { SaidaService } from './saida.service';
import { EnvioPorEmail, EnvioPorWhatsapp, EnvioSimulado } from './transporte';
import { WhatsappController } from './whatsapp.controller';

/**
 * Escolhe os transportes pela configuração.
 *
 * `ENVIO=simulado` em desenvolvimento e na suíte: o que sairia fica
 * numa lista em memória, e a suíte lê dela. Sem isso ela testaria a
 * rede em vez do produto — e mandaria e-mail de teste para gente de
 * verdade na primeira distração.
 */
function criarPortas(
  config: ConfigService,
  evolution: EvolutionClient,
  simulado: EnvioSimulado,
): PortasDeEnvio {
  if ((config.get<string>('ENVIO') ?? 'real') === 'simulado') {
    return { EMAIL: simulado, WHATSAPP: simulado };
  }

  return {
    EMAIL: new EnvioPorEmail(config),
    WHATSAPP: new EnvioPorWhatsapp(evolution, () => ({
      baseUrl: config.get<string>('EVOLUTION_BASE_URL') ?? 'http://192.168.15.72:8080',
      instance: config.get<string>('EVOLUTION_INSTANCE') ?? 'norty-desk',
      apiKey: config.get<string>('EVOLUTION_API_KEY') ?? '',
    })),
  };
}

@Module({
  /**
   * `forwardRef` dos dois lados: chamados precisam da fila de saída
   * para responder, e o processador de canal precisa dos chamados para
   * abrir. O ciclo é real e é do domínio — resolvê-lo movendo código
   * criaria um terceiro módulo que não corresponde a nada.
   */
  imports: [ConfigModule, AttachmentsModule, RegrasModule, forwardRef(() => TicketsModule)],
  controllers: [EmailController, WhatsappController],
  providers: [
    EntradaService,
    SaidaService,
    EvolutionClient,
    EnvioSimulado,
    DespachoJob,
    ProcessamentoService,
    {
      provide: PORTAS_DE_ENVIO,
      inject: [ConfigService, EvolutionClient, EnvioSimulado],
      useFactory: criarPortas,
    },
  ],
  exports: [EntradaService, SaidaService, EvolutionClient, EnvioSimulado, DespachoJob, ProcessamentoService],
})
export class ChannelsModule {}
