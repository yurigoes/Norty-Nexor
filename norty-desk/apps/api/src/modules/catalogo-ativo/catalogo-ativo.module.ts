import { Module } from '@nestjs/common';

import { CatalogoDoAtivoController } from './catalogo-ativo.controller';
import { CatalogoDoAtivoService } from './catalogo-ativo.service';
import { DicionarioDeFabricante } from './fabricantes.dicionario';

@Module({
  controllers: [CatalogoDoAtivoController],
  providers: [CatalogoDoAtivoService, DicionarioDeFabricante],
  // O dicionário sai daqui porque o inventário resolve fabricante por
  // ele: o nome que o agente manda e o que a tela cadastra têm de cair
  // no mesmo lugar, ou o catálogo se divide de novo por outro caminho.
  exports: [CatalogoDoAtivoService, DicionarioDeFabricante],
})
export class CatalogoDoAtivoModule {}
