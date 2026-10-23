import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { AnyContext, Ctx, OrgCtx, Public, type OrgContext, type RequestContext } from '../../common/context';
import { loadConfig } from '../../config/env';
import { FilesService } from './files.service';

class UploadDto {
  @IsString() @MaxLength(40) entityType!: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() customerVisible?: boolean;
}

class RemoveDto {
  @IsString() @MaxLength(300) reason!: string;
}

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: loadConfig().storage.maxUploadBytes, files: 1 } }))
  upload(@OrgCtx() ctx: OrgContext, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() dto: UploadDto) {
    return this.files.upload(ctx, file, dto);
  }

  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query('entityType') entityType: string, @Query('entityId', ParseUUIDPipe) entityId: string) {
    return this.files.list(ctx, entityType, entityId);
  }

  @AnyContext()
  @Get(':id/url')
  url(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.signedUrl(ctx, id);
  }

  @AnyContext()
  @Get(':id/download')
  async download(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { file, buffer } = await this.files.read(ctx, id);
    return send(res, file, buffer, 'attachment');
  }

  /** Link temporário assinado: sem token no cabeçalho, validade de 5 minutos. */
  @Public()
  @Get(':id/raw')
  async raw(@Param('id', ParseUUIDPipe) id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res({ passthrough: true }) res: Response) {
    const { file, buffer } = await this.files.readSigned(id, exp, sig);
    return send(res, file, buffer, 'inline');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RemoveDto) {
    return this.files.remove(ctx, id, dto.reason);
  }
}

export function send(res: Response, file: { mimeType: string; originalName: string; size: number }, buffer: Buffer, disposition: 'inline' | 'attachment'): StreamableFile {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(buffer);
}
