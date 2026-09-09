import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AttachmentView } from '@norty-desk/shared';
import type { Response } from 'express';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AttachmentsService } from './attachments.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentsController {
  constructor(private readonly anexos: AttachmentsService) {}

  @Post('tickets/:id/anexos')
  @RequirePermission('anexo:enviar')
  @UseInterceptors(FileInterceptor('file'))
  enviar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Query('eventId') eventId?: string,
  ): Promise<AttachmentView> {
    return this.anexos.enviar(usuario, id, arquivo, eventId);
  }

  @Get('tickets/:id/anexos')
  @RequirePermission('anexo:baixar')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttachmentView[]> {
    return this.anexos.listar(usuario, id);
  }

  @Get('anexos/:id')
  @RequirePermission('anexo:baixar')
  async baixar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const leitura = await this.anexos.paraLeitura(usuario, id);

    if (leitura.tipo === 'url') {
      resposta.redirect(302, leitura.url);
      return;
    }

    // `attachment` e não `inline`: um HTML anexado por terceiro,
    // servido inline na origem da API, executaria script com o cookie
    // de sessão ao alcance.
    resposta.setHeader('Content-Type', leitura.contentType);
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(leitura.filename)}"`,
    );
    resposta.setHeader('X-Content-Type-Options', 'nosniff');
    leitura.fluxo.pipe(resposta);
  }

  @Delete('anexos/:id')
  @HttpCode(204)
  @RequirePermission('anexo:remover')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.anexos.remover(usuario, id);
  }
}
