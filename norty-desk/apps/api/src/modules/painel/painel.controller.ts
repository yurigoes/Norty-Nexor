import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { PainelDoAtivo, PainelDoModeloView, PainelNoRackView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscreverPainelDto, EscreverZonaDto } from './dto';
import { PainelService } from './painel.service';

/**
 * O estêncil do painel.
 *
 * Duas pontas, e a permissão de cada uma diz de que lado está:
 *
 * - **o painel do modelo** é curadoria do catálogo (`ativo:catalogo`),
 *   como o fabricante e o apelido de modelo: o que se descreve ali vale
 *   para todo equipamento daquele modelo, e não é o equipamento de
 *   ninguém em particular;
 * - **o painel do equipamento** é leitura de plantão (`ativo:ler`), que
 *   é quem precisa dele às duas da manhã.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PainelController {
  constructor(
    private readonly painel: PainelService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get('asset-models/:id/paineis')
  @RequirePermission('ativo:ler')
  doModelo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PainelDoModeloView[]> {
    return this.painel.doModelo(usuario, id);
  }

  /** Manda como a face é. Há um painel por face, então `PUT` descreve melhor. */
  @Put('asset-models/:id/paineis/:face')
  @RequirePermission('ativo:catalogo')
  async escrever(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('face') face: string,
    @Body() dto: EscreverPainelDto,
  ): Promise<PainelDoModeloView[]> {
    const qual = PainelService.face(face);
    const paineis = await this.painel.escrever(usuario, id, qual, dto);

    await this.auditoria.registrar(usuario, {
      action: 'ativo.painel-definido',
      entity: 'ModelPanel',
      entityId: paineis.find((p) => p.face === qual)?.id ?? null,
      depois: { assetModelId: id, face: qual, columns: dto.columns, rows: dto.rows ?? 1 },
    });

    return paineis;
  }

  @Delete('asset-models/:id/paineis/:face')
  @RequirePermission('ativo:catalogo')
  async remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('face') face: string,
  ): Promise<PainelDoModeloView[]> {
    const qual = PainelService.face(face);
    const paineis = await this.painel.remover(usuario, id, qual);

    await this.auditoria.registrar(usuario, {
      action: 'ativo.painel-removido',
      entity: 'ModelPanel',
      entityId: id,
      antes: { assetModelId: id, face: qual },
    });

    return paineis;
  }

  @Post('asset-models/:id/paineis/:face/zonas')
  @RequirePermission('ativo:catalogo')
  criarZona(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('face') face: string,
    @Body() dto: EscreverZonaDto,
  ): Promise<PainelDoModeloView[]> {
    return this.painel.criarZona(usuario, id, PainelService.face(face), dto);
  }

  @Patch('asset-models/:id/paineis/:face/zonas/:zonaId')
  @RequirePermission('ativo:catalogo')
  editarZona(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('face') face: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
    @Body() dto: EscreverZonaDto,
  ): Promise<PainelDoModeloView[]> {
    return this.painel.editarZona(usuario, id, PainelService.face(face), zonaId, dto);
  }

  @Delete('asset-models/:id/paineis/:face/zonas/:zonaId')
  @RequirePermission('ativo:catalogo')
  removerZona(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('face') face: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
  ): Promise<PainelDoModeloView[]> {
    return this.painel.removerZona(usuario, id, PainelService.face(face), zonaId);
  }

  /**
   * Os painéis de um rack inteiro, para a elevação desenhar as portas
   * sem pedir um por equipamento.
   */
  @Get('racks/:id/paineis')
  @RequirePermission('ativo:ler')
  doRack(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PainelNoRackView[]> {
    return this.painel.doRack(usuario, id);
  }

  /** O desenho com as portas do equipamento por cima. Nulo é "não há painel". */
  @Get('assets/:id/painel')
  @RequirePermission('ativo:ler')
  doAtivo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PainelDoAtivo> {
    return this.painel.doAtivo(usuario, id);
  }
}
