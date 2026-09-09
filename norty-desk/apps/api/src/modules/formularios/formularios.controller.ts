import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { FormularioResolvido, FormularioView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EditarFormularioDto, EscreverFormularioDto } from './dto';
import { FormulariosService } from './formularios.service';

@Controller('forms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FormulariosController {
  constructor(private readonly formularios: FormulariosService) {}

  /**
   * O formulário que vale para uma categoria.
   *
   * Permissão de **abrir chamado**, não de configurar: é a tela de
   * abertura que pergunta, e todo mundo que abre chamado precisa saber
   * o que responder. Vem antes de `:id` para não cair no `ParseUUIDPipe`.
   */
  @Get('resolver')
  @RequirePermission('chamado:criar')
  resolver(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query('categoryId') categoryId?: string,
  ): Promise<FormularioResolvido> {
    return this.formularios.resolver(usuario.organizationId, categoryId || null);
  }

  @Get()
  @RequirePermission('config:formularios')
  listar(@CurrentUser() usuario: UsuarioAutenticado): Promise<FormularioView[]> {
    return this.formularios.listar(usuario);
  }

  @Get(':id')
  @RequirePermission('config:formularios')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FormularioView> {
    return this.formularios.obter(usuario, id);
  }

  @Post()
  @RequirePermission('config:formularios')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverFormularioDto,
  ): Promise<FormularioView> {
    return this.formularios.criar(usuario, dto);
  }

  @Patch(':id')
  @RequirePermission('config:formularios')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarFormularioDto,
  ): Promise<FormularioView> {
    return this.formularios.editar(usuario, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('config:formularios')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.formularios.remover(usuario, id);
  }
}
