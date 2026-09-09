import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuditEntry } from '@norty-desk/shared';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditoriaService } from './auditoria.service';

export class FiltroDeAuditoriaDto {
  @IsOptional() @IsString() @MaxLength(60) entity?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get('audit-logs')
  @RequirePermission('auditoria:ler')
  consultar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: FiltroDeAuditoriaDto,
  ): Promise<AuditEntry[]> {
    return this.auditoria.consultar(usuario, filtro) as Promise<AuditEntry[]>;
  }
}
