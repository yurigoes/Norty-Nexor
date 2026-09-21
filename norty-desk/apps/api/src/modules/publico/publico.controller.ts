import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { ConsultaPublica } from '@norty-desk/shared';
import type { Request, Response } from 'express';

import { ipDaRequisicao } from '../../common/origem';
import { comprovanteDeProtocolo } from './pdf';
import { PublicoService } from './publico.service';

/**
 * As duas rotas sem sessão da consulta por protocolo.
 *
 * Sem `JwtAuthGuard` de propósito: quem consulta o protocolo não tem
 * conta, e mandá-lo para o login seria o mesmo que não ter a consulta.
 * A autorização é o próprio código, e o que a sustenta é a escada de
 * bloqueio por IP no serviço.
 */
@Controller('publico')
export class PublicoController {
  constructor(private readonly publico: PublicoService) {}

  @Get('protocolo/:codigo')
  consultar(
    @Param('codigo') codigo: string,
    @Req() requisicao: Request,
  ): Promise<ConsultaPublica> {
    return this.publico.consultar(codigo, ipDaRequisicao(requisicao));
  }

  @Get('protocolo/:codigo/pdf')
  async pdf(
    @Param('codigo') codigo: string,
    @Req() requisicao: Request,
    @Res() resposta: Response,
  ): Promise<void> {
    const consulta = await this.publico.consultar(codigo, ipDaRequisicao(requisicao));
    const arquivo = await comprovanteDeProtocolo(consulta);

    resposta.setHeader('Content-Type', 'application/pdf');
    resposta.setHeader('Content-Length', arquivo.length);
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="protocolo-${consulta.protocol}.pdf"`,
    );
    // O comprovante mostra o andamento do momento: guardado em cache,
    // mostraria o de ontem na próxima consulta.
    resposta.setHeader('Cache-Control', 'no-store');
    resposta.end(arquivo);
  }
}
