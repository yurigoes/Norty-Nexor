import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { CatalogService } from './catalog.service';
import { CategoryDto, MakeDto, ModelDto, UpdateCategoryDto, UpdateModelDto, UpdateVersionDto, VersionDto } from './dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('fleet.view')
  @Get('categories')
  categories(@OrgCtx() ctx: OrgContext, @Query('all') all?: string) {
    return this.catalog.categories(ctx, all === 'true');
  }

  @RequirePermission('catalog.manage')
  @Post('categories')
  createCategory(@OrgCtx() ctx: OrgContext, @Body() dto: CategoryDto) {
    return this.catalog.createCategory(ctx, dto);
  }

  @RequirePermission('catalog.manage')
  @Patch('categories/:id')
  updateCategory(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(ctx, id, dto);
  }

  @RequirePermission('fleet.view')
  @Get('makes')
  makes(@OrgCtx() ctx: OrgContext) {
    return this.catalog.makes(ctx);
  }

  @RequirePermission('catalog.manage')
  @Post('makes')
  createMake(@OrgCtx() ctx: OrgContext, @Body() dto: MakeDto) {
    return this.catalog.createMake(ctx, dto.name);
  }

  @RequirePermission('fleet.view')
  @Get('models')
  models(
    @OrgCtx() ctx: OrgContext,
    @Query('categoryId') categoryId?: string,
    @Query('makeId') makeId?: string,
    @Query('q') q?: string,
    @Query('publicOnly') publicOnly?: string,
    @Query('all') all?: string,
  ) {
    return this.catalog.models(ctx, { categoryId: categoryId || undefined, makeId: makeId || undefined, q: q?.slice(0, 80) || undefined, publicOnly: publicOnly === 'true', includeInactive: all === 'true' });
  }

  @RequirePermission('fleet.view')
  @Get('models/:id')
  model(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.model(ctx, id);
  }

  @RequirePermission('catalog.manage')
  @Post('models')
  createModel(@OrgCtx() ctx: OrgContext, @Body() dto: ModelDto) {
    return this.catalog.createModel(ctx, dto);
  }

  @RequirePermission('catalog.manage')
  @Patch('models/:id')
  updateModel(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModelDto) {
    return this.catalog.updateModel(ctx, id, dto);
  }

  @RequirePermission('catalog.manage')
  @Post('models/:id/versions')
  createVersion(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.catalog.createVersion(ctx, id, dto);
  }

  @RequirePermission('catalog.manage')
  @Patch('versions/:id')
  updateVersion(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVersionDto) {
    return this.catalog.updateVersion(ctx, id, dto);
  }
}
