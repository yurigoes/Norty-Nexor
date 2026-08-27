import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { CondominiumId, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.view')
  list(@CondominiumId() condominiumId: string, @Query() query: PageQueryDto) {
    return this.audit.list(condominiumId, query);
  }
}
