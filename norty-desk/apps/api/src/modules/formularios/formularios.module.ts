import { Module } from '@nestjs/common';

import { FormulariosController } from './formularios.controller';
import { FormulariosService } from './formularios.service';

/**
 * Módulo-folha: só depende do Prisma e da auditoria (global).
 * Quem abre chamado importa este; ele não importa ninguém de volta.
 */
@Module({
  controllers: [FormulariosController],
  providers: [FormulariosService],
  exports: [FormulariosService],
})
export class FormulariosModule {}
