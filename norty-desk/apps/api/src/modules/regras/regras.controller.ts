import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CHANNELS, type Channel } from '@norty-desk/shared';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RegrasService } from './regras.service';

export class CriarRegraDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  /**
   * A lista de critérios, ou o objeto `{ match, criteria }`.
   *
   * As duas entram: a tela manda a lista com `match` ao lado, e a
   * chamada antiga mandava o objeto. A forma é validada no serviço,
   * que conhece o formato.
   *
   * `@Allow()` é obrigatório: com `whitelist: true`, campo sem
   * decorador nenhum é **apagado** do corpo, e a regra chegaria vazia —
   * que foi exatamente o defeito que a suíte pegou aqui.
   */
  @Allow()
  criteria!: unknown;
  @IsOptional() @IsIn(['E', 'OU']) match?: 'E' | 'OU';
  @IsArray() actions!: unknown[];
  @IsOptional() @IsBoolean() stopOnMatch?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarRegraDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @Allow() criteria?: unknown;
  @IsOptional() @IsIn(['E', 'OU']) match?: 'E' | 'OU';
  @IsOptional() @IsArray() actions?: unknown[];
  @IsOptional() @IsBoolean() stopOnMatch?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** A mensagem de mentira que a simulação avalia. */
export class SimularEntradaDto {
  @IsOptional() @IsString() @MaxLength(500) assunto?: string;
  @IsOptional() @IsString() @MaxLength(20000) corpo?: string;
  @IsOptional() @IsString() @MaxLength(320) remetente?: string;
  @IsIn(CHANNELS) canal!: Channel;
  @IsOptional() @IsUUID() categoriaId?: string;
}

@Controller('intake-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RegrasController {
  constructor(private readonly regras: RegrasService) {}

  @Get()
  @RequirePermission('config:regras-entrada')
  listar(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.regras.listar(usuario);
  }

  @Post()
  @RequirePermission('config:regras-entrada')
  criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarRegraDto) {
    return this.regras.criar(usuario, dto);
  }

  /**
   * O que aconteceria com esta mensagem agora.
   *
   * `POST` e não `GET` porque o corpo do e-mail entra no pedido, e
   * `HttpCode(200)` porque nada foi criado. Vale a rota própria: o
   * jeito de descobrir por que a fila saiu errada não pode ser mandar
   * um e-mail de verdade e ver onde ele cai.
   */
  @Post('simular')
  @HttpCode(200)
  @RequirePermission('config:regras-entrada')
  simular(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: SimularEntradaDto) {
    return this.regras.simular(usuario, {
      assunto: dto.assunto ?? '',
      corpo: dto.corpo ?? '',
      remetente: dto.remetente ?? '',
      canal: dto.canal,
      categoriaId: dto.categoriaId ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission('config:regras-entrada')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarRegraDto,
  ) {
    return this.regras.editar(usuario, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('config:regras-entrada')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.regras.remover(usuario, id);
  }
}
