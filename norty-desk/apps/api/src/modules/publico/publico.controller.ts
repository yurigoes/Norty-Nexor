import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  AberturaPublicaResposta,
  AttachmentView,
  CategoriaPublica,
  ConsultaPublica,
  ConviteDeSenha,
  EmpresaPublica,
  ModeloDeChamado,
  PessoaReconhecida,
} from '@norty-desk/shared';
import type { Request, Response } from 'express';

import { ipDaRequisicao } from '../../common/origem';
import { DefinirSenhaDto } from '../automacao/dto';
import { SenhaService } from '../automacao/senha.service';
import { AberturaService } from './abertura.service';
import { AbrirPublicoDto, BuscarEmpresaDto, ReconhecerPessoaDto } from './dto';
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
    private readonly senha: SenhaService,
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

  /** Os tipos de chamado que esta empresa pode escolher sem login. */
  @Get('empresas/:clientId/tipos')
  tipos(@Param('clientId', ParseUUIDPipe) clientId: string): Promise<CategoriaPublica[]> {
    return this.abertura.tiposPublicos(clientId);
  }

  /** Os modelos que valem na abertura sem login, com os campos junto. */
  @Get('empresas/:clientId/modelos')
  modelos(@Param('clientId', ParseUUIDPipe) clientId: string): Promise<ModeloDeChamado[]> {
    return this.abertura.modelosPublicos(clientId);
  }

  /**
   * Quem é esta pessoa, para a tela preencher o resto.
   *
   * Devolve uma pessoa ou `null` — nunca uma lista. Só casa com o
   * e-mail inteiro ou o nome completo de alguém cadastrado nesta
   * empresa: com prefixo, esta rota seria o catálogo de funcionários
   * dela aberto a quem só digitou uma letra.
   */
  @Get('empresas/:clientId/pessoa')
  reconhecer(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() filtro: ReconhecerPessoaDto,
    @Req() requisicao: Request,
  ): Promise<PessoaReconhecida | null> {
    return this.abertura.reconhecerPessoa(clientId, filtro.q, ipDaRequisicao(requisicao));
  }

  @Post('chamados')
  abrirChamado(
    @Body() dto: AbrirPublicoDto,
    @Req() requisicao: Request,
  ): Promise<AberturaPublicaResposta> {
    return this.abertura.abrir(dto, ipDaRequisicao(requisicao));
  }

  /**
   * O anexo da abertura sem login.
   *
   * Separado do `POST /chamados` de propósito: o corpo do chamado é
   * JSON, e misturar `multipart` ali faria toda abertura pagar o preço
   * de um formulário de arquivo para anexar nada. Quem anexa já tem o
   * protocolo em mãos — é ele a credencial, como na consulta.
   */
  @Post('chamados/:protocolo/anexos')
  @UseInterceptors(FileInterceptor('file'))
  anexar(
    @Param('protocolo') protocolo: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Req() requisicao: Request,
  ): Promise<AttachmentView> {
    return this.abertura.anexar(protocolo, arquivo, ipDaRequisicao(requisicao));
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

  /**
   * O convite de troca de senha ainda vale?
   *
   * A tela pergunta antes de pedir a senha nova: digitar duas vezes uma
   * senha e só então descobrir que o link expirou é a forma mais
   * irritante possível de dar essa notícia.
   */
  @Get('definir-senha/:token')
  convite(@Param('token') token: string, @Req() requisicao: Request): Promise<ConviteDeSenha> {
    return this.senha.convite(token, ipDaRequisicao(requisicao));
  }

  @Post('definir-senha')
  async definirSenha(
    @Body() dto: DefinirSenhaDto,
    @Req() requisicao: Request,
  ): Promise<{ ok: true }> {
    await this.senha.definir(dto.token, dto.nova, ipDaRequisicao(requisicao));
    return { ok: true };
  }
}
