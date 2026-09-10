import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './common/prisma/prisma.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { ConhecimentoModule } from './modules/conhecimento/conhecimento.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { HealthModule } from './modules/health/health.module';
import { IntakeModule } from './modules/intake/intake.module';
import { PaineisModule } from './modules/paineis/paineis.module';
import { RegrasModule } from './modules/regras/regras.module';
import { AprovacoesModule } from './modules/aprovacoes/aprovacoes.module';
import { AtivosModule } from './modules/ativos/ativos.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { LoteModule } from './modules/lote/lote.module';
import { CatalogoDoAtivoModule } from './modules/catalogo-ativo/catalogo-ativo.module';
import { ContratosModule } from './modules/contratos/contratos.module';
import { FormulariosModule } from './modules/formularios/formularios.module';
import { ModelosModule } from './modules/modelos/modelos.module';
import { MudancasModule } from './modules/mudancas/mudancas.module';
import { ProblemasModule } from './modules/problemas/problemas.module';
import { RecorrenciasModule } from './modules/recorrencias/recorrencias.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { SatisfacaoModule } from './modules/satisfacao/satisfacao.module';
import { SlaModule } from './modules/sla/sla.module';
import { SoftwareModule } from './modules/software/software.module';
import { ConsumiveisModule } from './modules/consumiveis/consumiveis.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { TranscricaoModule } from './modules/transcricao/transcricao.module';

@Module({
  imports: [
    /**
     * `NODE_ENV=test` lê `.env.test`, e só ele.
     *
     * Sem esta linha o `ConfigModule` cai no `.env` de
     * desenvolvimento: a suíte apontaria para o banco de trabalho —
     * que ela trunca a cada execução — e usaria os transportes de
     * verdade em vez do simulado. Aconteceu.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    TicketsModule,
    AprovacoesModule,
    AttachmentsModule,
    CatalogoModule,
    ConhecimentoModule,
    PaineisModule,
    AtivosModule,
    ProblemasModule,
    MudancasModule,
    RecorrenciasModule,
    FormulariosModule,
    ContratosModule,
    CatalogoDoAtivoModule,
    SoftwareModule,
    ConsumiveisModule,
    ModelosModule,
    TarefasModule,
    SatisfacaoModule,
    BrandModule,
    SlaModule,
    ChannelsModule,
    IntakeModule,
    RegrasModule,
    WebhooksModule,
    AuditoriaModule,
    TranscricaoModule,
    LoteModule,
  ],
})
export class AppModule {}
