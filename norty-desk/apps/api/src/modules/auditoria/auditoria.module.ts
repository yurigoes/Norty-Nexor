import { Global, Module } from '@nestjs/common';

import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

/**
 * Global porque a trilha é transversal: canal, marca, webhook, catálogo
 * e lote registram nela. Injetar o módulo em cada um deles seria repetir
 * a mesma linha em oito lugares sem ganhar nada.
 */
@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
