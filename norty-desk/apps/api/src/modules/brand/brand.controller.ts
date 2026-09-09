import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
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
   * Público de propósito: a tela de entrada precisa da marca antes de
   * haver token. Não devolve nada além da marca.
   */
  @Get()
  publica(): Promise<MarcaPublica> {
    return this.marca.publica();
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
  editar(@Body() dto: EditarMarcaDto): Promise<MarcaPublica> {
    return this.marca.editar(dto);
  }

  @Post(':qual(logo|favicon)')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('organizacao:gerenciar')
  @UseInterceptors(FileInterceptor('file'))
  enviar(
    @Param('qual') qual: 'logo' | 'favicon',
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<MarcaPublica> {
    return this.marca.enviarImagem(qual, arquivo);
  }

  @Delete(':qual(logo|favicon)')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('organizacao:gerenciar')
  remover(@Param('qual') qual: 'logo' | 'favicon'): Promise<MarcaPublica> {
    return this.marca.removerImagem(qual);
  }
}
