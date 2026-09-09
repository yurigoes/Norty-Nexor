import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
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
   * `{ match, criteria }` — a forma é validada no serviço, que conhece
   * o formato. `@Allow()` é obrigatório: com `whitelist: true`, campo
   * sem decorador nenhum é **apagado** do corpo, e a regra chegaria
   * vazia — que foi exatamente o defeito que a suíte pegou aqui.
   */
  @Allow()
  criteria!: unknown;
  @IsArray() actions!: unknown[];
  @IsOptional() @IsBoolean() stopOnMatch?: boolean;
}

export class EditarRegraDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @Allow() criteria?: unknown;
  @IsOptional() @IsArray() actions?: unknown[];
  @IsOptional() @IsBoolean() stopOnMatch?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
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
