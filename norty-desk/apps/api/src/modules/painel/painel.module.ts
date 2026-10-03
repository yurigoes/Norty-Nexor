import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PainelController } from './painel.controller';
import { PainelService } from './painel.service';

/**
 * O estêncil do painel: onde cada porta fica na frente do equipamento.
 *
 * É o `Stencil` do GLPI 11 (ver `docs/14-estencil-do-painel.md`). Módulo
 * próprio, e não dentro do catálogo ou do datacenter, porque ele fala
 * com os dois: o painel é cadastro de modelo, o uso é no equipamento e a
 * razão de existir é o rack.
 */
@Module({
  imports: [AuditoriaModule],
  controllers: [PainelController],
  providers: [PainelService],
  exports: [PainelService],
})
export class PainelModule {}
