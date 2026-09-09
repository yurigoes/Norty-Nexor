import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import type { BulkResult } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { LoteDto } from './dto';
import { LoteService } from './lote.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoteController {
  constructor(private readonly lote: LoteService) {}

  @Post('tickets/lote')
  @RequirePermission('chamado:acao-em-lote')
  executar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: LoteDto,
    @Ip() ip: string,
  ): Promise<BulkResult> {
    return this.lote.executar(usuario, dto, ip);
  }
}
