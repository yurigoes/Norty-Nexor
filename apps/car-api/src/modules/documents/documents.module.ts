import { Controller, Get, Module, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrgCtx, type OrgContext } from '../../common/context';
import { DocumentsService } from './documents.service';

class ExpiringQueryDto {
  @IsOptional() @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value))) @IsInt() @Min(0) @Max(365) days?: number;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** A permissão é decidida por fonte no service: cada perfil vê só o que pode. */
  @Get('expiring')
  expiring(@OrgCtx() ctx: OrgContext, @Query() q: ExpiringQueryDto) {
    return this.documents.expiring(ctx, q.days);
  }
}

@Module({ controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
