import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InscricoesService } from './inscricoes.service';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { PORTA_DE_PUSH } from './notificacoes.tokens';
import { EnvioDePushReal, EnvioDePushSimulado, type PortaDePush } from './push.transporte';

/**
 * `ENVIO=simulado` troca o transporte, como nos canais: em
 * desenvolvimento e na suíte o aviso fica numa lista em memória em vez
 * de ir para o serviço de push do navegador.
 */
function escolherPorta(
  config: ConfigService,
  simulado: EnvioDePushSimulado,
  real: EnvioDePushReal,
): PortaDePush {
  return (config.get<string>('ENVIO') ?? 'real') === 'simulado' ? simulado : real;
}

/**
 * Global porque o aviso nasce em módulos espalhados — chamado,
 * aprovação, SLA — e cada um importar este módulo criaria um ciclo com
 * quem já importa aqueles.
 */
@Global()
@Module({
  controllers: [NotificacoesController],
  providers: [
    NotificacoesService,
    InscricoesService,
    EnvioDePushReal,
    EnvioDePushSimulado,
    {
      provide: PORTA_DE_PUSH,
      inject: [ConfigService, EnvioDePushSimulado, EnvioDePushReal],
      useFactory: escolherPorta,
    },
  ],
  exports: [NotificacoesService, EnvioDePushSimulado],
})
export class NotificacoesModule {}
