import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type {
  AberturaPublicaResposta,
  ConsultaPublica,
  EmpresaPublica,
} from '@norty-desk/shared';
import type { Request, Response } from 'express';

import { ipDaRequisicao } from '../../common/origem';
import { AberturaService } from './abertura.service';
import { AbrirPublicoDto, BuscarEmpresaDto } from './dto';
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
  constructor(
    private readonly publico: PublicoService,
    private readonly abertura: AberturaService,
  ) {}

  /**
   * As empresas parecidas com o que a pessoa digitou.
   *
   * Nome aceita erro de digitação e acento; documento é exato, por
   * dígitos, com ou sem pontuação.
   */
  @Get('empresas')
  buscarEmpresas(
    @Query() filtro: BuscarEmpresaDto,
    @Req() requisicao: Request,
  ): Promise<EmpresaPublica[]> {
    return this.abertura.buscarEmpresas(filtro.q, ipDaRequisicao(requisicao));
  }

  @Post('chamados')
  abrirChamado(
    @Body() dto: AbrirPublicoDto,
    @Req() requisicao: Request,
  ): Promise<AberturaPublicaResposta> {
    return this.abertura.abrir(dto, ipDaRequisicao(requisicao));
  }

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
