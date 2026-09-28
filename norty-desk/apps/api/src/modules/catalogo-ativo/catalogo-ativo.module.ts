import { Module } from '@nestjs/common';

import { CatalogoDoAtivoController } from './catalogo-ativo.controller';
import { CatalogoDoAtivoService } from './catalogo-ativo.service';
import { DicionarioDeFabricante } from './fabricantes.dicionario';
import { DicionarioDeModelo } from './modelos.dicionario';
import { DicionarioDeSistemaOperacional } from './sistemas.dicionario';

@Module({
  controllers: [CatalogoDoAtivoController],
  providers: [
    CatalogoDoAtivoService,
    DicionarioDeFabricante,
    DicionarioDeModelo,
    DicionarioDeSistemaOperacional,
  ],
  // Os três dicionários saem daqui porque o inventário resolve por
  // eles: o nome que o agente manda e o que a tela cadastra têm de cair
  // no mesmo lugar, ou o catálogo se divide de novo por outro caminho.
  exports: [
    CatalogoDoAtivoService,
    DicionarioDeFabricante,
    DicionarioDeModelo,
    DicionarioDeSistemaOperacional,
  ],
})
export class CatalogoDoAtivoModule {}
