import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AttachmentsModule } from '../attachments/attachments.module';
import { RegrasModule } from '../regras/regras.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PORTAS_DE_ENVIO, type PortasDeEnvio } from './canais.tokens';
import { ProcessamentoService } from './processamento.service';
import { AuthModule } from '../auth/auth.module';
import { CanaisController } from './canais.controller';
import { ColetaJob } from './coleta.job';
import { DespachoJob } from './despacho.job';
import { EmailController } from './email.controller';
import { EntradaService } from './entrada.service';
import { EvolutionClient } from './evolution.client';
import { MetaClient } from './meta.client';
import { MetaController } from './meta.controller';
import { SaidaService } from './saida.service';
import { EnvioPorEmail, EnvioSimulado } from './transporte';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappBot } from './whatsapp.bot';
import { EnvioDeWhatsapp } from './whatsapp.envio';

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
  whatsapp: EnvioDeWhatsapp,
  simulado: EnvioSimulado,
): PortasDeEnvio {
  if ((config.get<string>('ENVIO') ?? 'real') === 'simulado') {
    return { EMAIL: simulado, WHATSAPP: simulado };
  }

  // O WhatsApp passou a ser um provider de verdade: ele lê banco para
  // saber por qual conta a mensagem sai — Meta ou Evolution — e para
  // conferir a janela de 24 h. Antes era uma classe montada aqui com
  // valores do ambiente, o que amarrava a instalação inteira a um
  // transporte só.
  return { EMAIL: new EnvioPorEmail(config), WHATSAPP: whatsapp };
}

@Module({
  /**
   * `forwardRef` dos dois lados: chamados precisam da fila de saída
   * para responder, e o processador de canal precisa dos chamados para
   * abrir. O ciclo é real e é do domínio — resolvê-lo movendo código
   * criaria um terceiro módulo que não corresponde a nada.
   */
  imports: [
    ConfigModule,
    AttachmentsModule,
    RegrasModule,
    AuthModule,
    forwardRef(() => TicketsModule),
  ],
  controllers: [EmailController, WhatsappController, MetaController, CanaisController],
  providers: [
    EntradaService,
    SaidaService,
    EvolutionClient,
    MetaClient,
    WhatsappBot,
    EnvioDeWhatsapp,
    EnvioSimulado,
    DespachoJob,
    ColetaJob,
    ProcessamentoService,
    {
      provide: PORTAS_DE_ENVIO,
      inject: [ConfigService, EnvioDeWhatsapp, EnvioSimulado],
      useFactory: criarPortas,
    },
  ],
  exports: [
    EntradaService,
    SaidaService,
    EvolutionClient,
    MetaClient,
    WhatsappBot,
    EnvioSimulado,
    DespachoJob,
    ColetaJob,
    ProcessamentoService,
  ],
})
export class ChannelsModule {}
