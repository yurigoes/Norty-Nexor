import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import type { FatiaDeContagem, PainelView, RelatorioSlaView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PainelDto, RelatorioSlaDto, RelatorioVolumeDto } from './dto';
import { PaineisService } from './paineis.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaineisController {
  constructor(private readonly paineis: PaineisService) {}

  @Get('dashboards/agente')
  @RequirePermission('painel:proprio')
  agente(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() dto: PainelDto,
  ): Promise<PainelView> {
    return this.paineis.doAgente(usuario, dto);
  }

  @Get('dashboards/time')
  @RequirePermission('painel:time')
  time(@CurrentUser() usuario: UsuarioAutenticado, @Query() dto: PainelDto): Promise<PainelView> {
    return this.paineis.doTime(usuario, dto);
  }

  @Get('dashboards/organizacao')
  @RequirePermission('painel:organizacao')
  organizacao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() dto: PainelDto,
  ): Promise<PainelView> {
    return this.paineis.daOrganizacao(usuario, dto);
  }

  @Get('reports/sla')
  @RequirePermission('relatorio:exportar')
  async sla(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() dto: RelatorioSlaDto,
  ): Promise<RelatorioSlaView | string> {
    const relatorio = await this.paineis.relatorioDeSla(usuario, dto);

    if (dto.formato !== 'csv') return relatorio;

    return PaineisService.paraCsv(
      [relatorio.agrupamento, 'total', 'cumpridos', 'violados', 'em aberto', '% cumprimento'],
      [
        ...relatorio.linhas.map((l) => [
          l.rotulo,
          l.total,
          l.cumpridos,
          l.violados,
          l.emAberto,
          l.percentual,
        ]),
        ['GERAL', relatorio.geral.total, relatorio.geral.cumpridos, relatorio.geral.violados, relatorio.geral.emAberto, relatorio.geral.percentual],
      ],
    );
  }

  @Get('reports/volume')
  @RequirePermission('relatorio:exportar')
  @Header('Cache-Control', 'no-store')
  async volume(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() dto: RelatorioVolumeDto,
  ): Promise<FatiaDeContagem[] | string> {
    const linhas = await this.paineis.volume(
      usuario,
      dto.agrupar ?? 'categoria',
      dto.periodo,
      dto.limit,
    );

    if (dto.formato !== 'csv') return linhas;

    return PaineisService.paraCsv(
      [dto.agrupar ?? 'categoria', 'total'],
      linhas.map((l) => [l.rotulo, l.total]),
    );
  }
}
