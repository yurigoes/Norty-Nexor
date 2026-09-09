import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  ContratoView,
  CustoDoChamado,
  FornecedorView,
  OrcamentoView,
  RelatorioDeCusto,
} from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ContratosService } from './contratos.service';
import {
  BuscarContratosDto,
  EditarContratoDto,
  EscreverContratoDto,
  EscreverFornecedorDto,
  EscreverOrcamentoDto,
  LancarCustoDto,
  RelatorioDeCustoDto,
  VincularAtivoAoContratoDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContratosController {
  constructor(private readonly contratos: ContratosService) {}

  // --- Fornecedores ----------------------------------------------------

  @Get('suppliers')
  @RequirePermission('contrato:ler')
  listarFornecedores(@CurrentUser() usuario: UsuarioAutenticado): Promise<FornecedorView[]> {
    return this.contratos.listarFornecedores(usuario);
  }

  @Post('suppliers')
  @RequirePermission('contrato:gerenciar')
  criarFornecedor(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverFornecedorDto,
  ): Promise<FornecedorView> {
    return this.contratos.criarFornecedor(usuario, dto);
  }

  // --- Contratos -------------------------------------------------------

  @Get('contracts')
  @RequirePermission('contrato:ler')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarContratosDto,
  ): Promise<ContratoView[]> {
    return this.contratos.listarContratos(usuario, filtro);
  }

  @Get('contracts/:id')
  @RequirePermission('contrato:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContratoView> {
    return this.contratos.obterContrato(usuario, id);
  }

  /** "Isso está na garantia?" — os ativos que o contrato cobre. */
  @Get('contracts/:id/ativos')
  @RequirePermission('contrato:ler')
  ativos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contratos.ativosDoContrato(usuario, id);
  }

  @Post('contracts')
  @RequirePermission('contrato:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverContratoDto,
  ): Promise<ContratoView> {
    return this.contratos.criarContrato(usuario, dto);
  }

  @Patch('contracts/:id')
  @RequirePermission('contrato:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarContratoDto,
  ): Promise<ContratoView> {
    return this.contratos.editarContrato(usuario, id, dto);
  }

  @Post('contracts/:id/ativos')
  @RequirePermission('contrato:gerenciar')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularAtivoAoContratoDto,
  ): Promise<ContratoView> {
    return this.contratos.vincularAtivo(usuario, id, dto.assetId);
  }

  @Delete('contracts/:id/ativos/:assetId')
  @RequirePermission('contrato:gerenciar')
  desvincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<ContratoView> {
    return this.contratos.desvincularAtivo(usuario, id, assetId);
  }

  // --- Orçamento -------------------------------------------------------

  @Get('budgets')
  @RequirePermission('custo:ler')
  orcamentos(@CurrentUser() usuario: UsuarioAutenticado): Promise<OrcamentoView[]> {
    return this.contratos.listarOrcamentos(usuario);
  }

  @Post('budgets')
  @RequirePermission('contrato:gerenciar')
  criarOrcamento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverOrcamentoDto,
  ): Promise<OrcamentoView> {
    return this.contratos.criarOrcamento(usuario, dto);
  }

  // --- Custo do chamado -------------------------------------------------

  @Get('tickets/:id/custos')
  @RequirePermission('custo:ler')
  custos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustoDoChamado> {
    return this.contratos.custosDoChamado(usuario, id);
  }

  @Post('tickets/:id/custos')
  @RequirePermission('custo:lancar')
  lancar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LancarCustoDto,
  ): Promise<CustoDoChamado> {
    return this.contratos.lancarCusto(usuario, id, dto);
  }

  @Delete('tickets/:id/custos/:custoId')
  @RequirePermission('custo:lancar')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('custoId', ParseUUIDPipe) custoId: string,
  ): Promise<CustoDoChamado> {
    return this.contratos.removerCusto(usuario, id, custoId);
  }

  /** Quanto custou atender. É o número que faz o resto disto valer a pena. */
  @Get('reports/custo')
  @RequirePermission('custo:ler')
  relatorio(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: RelatorioDeCustoDto,
  ): Promise<RelatorioDeCusto> {
    return this.contratos.relatorio(usuario, filtro);
  }
}
