import { Controller, Get, Param, Query } from '@nestjs/common';
import { DirectoryService } from './directory.service';
import { CondominiumId, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';

@Controller()
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get('towers')
  @RequirePermission('units.view')
  towers(@CondominiumId() condominiumId: string) {
    return this.directory.towers(condominiumId);
  }

  @Get('units')
  @RequirePermission('units.view')
  units(
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('towerId') towerId?: string,
  ) {
    return this.directory.units(condominiumId, query, towerId);
  }

  @Get('units/:id')
  @RequirePermission('units.view')
  unit(@CondominiumId() condominiumId: string, @Param('id') id: string) {
    return this.directory.unit(condominiumId, id);
  }

  @Get('residents')
  @RequirePermission('residents.view')
  residents(
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('unitId') unitId?: string,
  ) {
    return this.directory.residents(condominiumId, query, unitId);
  }

  @Get('search')
  @RequirePermission('residents.view')
  search(@CondominiumId() condominiumId: string, @Query('q') q = '') {
    return this.directory.search(condominiumId, q);
  }
}
