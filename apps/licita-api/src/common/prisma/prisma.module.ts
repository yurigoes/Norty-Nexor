/* =========================================================
   LICITA+ API — Prisma como módulo global
   ---------------------------------------------------------
   Módulo do Nest não herda provider do módulo pai: declarar
   `PrismaService` na lista do AppModule deixava o AuthModule
   sem ele, e a aplicação nem chegava a escutar a porta.

   Global é a escolha certa aqui, e não a saída preguiçosa: a
   conexão com o banco é uma só para o processo inteiro, e
   repetir `imports: [PrismaModule]` em cada módulo novo é o
   tipo de linha que alguém esquece — e o erro só aparece na
   subida seguinte.
   ========================================================= */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
