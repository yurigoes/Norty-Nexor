import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { paraCaminhoPublico } from '../../common/prefixo-publico';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BrandService, type MarcaPublica } from './brand.service';

export class EditarMarcaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) productName?: string;
  @IsOptional() @IsString() @MaxLength(160) tagline?: string;
}

export class QualDto {
  @IsIn(['logo', 'favicon']) qual!: 'logo' | 'favicon';
}

@Controller('brand')
export class BrandController {
  constructor(private readonly marca: BrandService) {}

  /**
   * O serviço monta as URLs com o caminho de dentro (`/v1/brand/logo`); o
   * navegador só alcança a API por `/api/v1`. Sem esta troca, a logo
   * pedida em `/v1/...` caía no fallback da SPA e voltava HTML — imagem
   * quebrada logo depois do upload.
   */
  private publicar(requisicao: Request, marca: MarcaPublica): MarcaPublica {
    return {
      ...marca,
      logoUrl: paraCaminhoPublico(marca.logoUrl, requisicao),
      faviconUrl: paraCaminhoPublico(marca.faviconUrl, requisicao),
    };
  }

  /**
   * Público de propósito: a tela de entrada precisa da marca antes de
   * haver token. Não devolve nada além da marca.
   */
  @Get()
  async publica(@Req() requisicao: Request): Promise<MarcaPublica> {
    return this.publicar(requisicao, await this.marca.publica());
  }

  @Get(':qual(logo|favicon)')
  async imagem(
    @Param('qual') qual: 'logo' | 'favicon',
    @Res() resposta: Response,
  ): Promise<void> {
    const { fluxo, contentType } = await this.marca.imagem(qual);

    resposta.setHeader('Content-Type', contentType);
    resposta.setHeader('X-Content-Type-Options', 'nosniff');
    // A URL carrega `?v=`, então o conteúdo daquele endereço é imutável:
    // trocar a logo muda a URL, e o cache longo não atrapalha.
    resposta.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fluxo.pipe(resposta);
  }

  @Patch()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('organizacao:gerenciar')
  async editar(@Req() requisicao: Request, @Body() dto: EditarMarcaDto): Promise<MarcaPublica> {
    return this.publicar(requisicao, await this.marca.editar(dto));
  }

  @Post(':qual(logo|favicon)')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('organizacao:gerenciar')
  @UseInterceptors(FileInterceptor('file'))
  async enviar(
    @Req() requisicao: Request,
    @Param('qual') qual: 'logo' | 'favicon',
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<MarcaPublica> {
    return this.publicar(requisicao, await this.marca.enviarImagem(qual, arquivo));
  }

  @Delete(':qual(logo|favicon)')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('organizacao:gerenciar')
  async remover(
    @Req() requisicao: Request,
    @Param('qual') qual: 'logo' | 'favicon',
  ): Promise<MarcaPublica> {
    return this.publicar(requisicao, await this.marca.removerImagem(qual));
  }
}
