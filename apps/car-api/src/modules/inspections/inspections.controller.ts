import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { InspectionsService } from './inspections.service';
import {
  CompareQueryDto, CompleteInspectionDto, CreateInspectionDto, DamageDto, InspectionQueryDto, ItemDto, PhotoDto, TemplateDto,
  UpdateInspectionDto, UpdateTemplateDto,
} from './dto';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @RequirePermission('inspections.view')
  @Get('templates')
  templates(@OrgCtx() ctx: OrgContext) {
    return this.inspections.templates(ctx);
  }

  @RequirePermission('inspections.approve')
  @Post('templates')
  createTemplate(@OrgCtx() ctx: OrgContext, @Body() dto: TemplateDto) {
    return this.inspections.createTemplate(ctx, dto);
  }

  @RequirePermission('inspections.approve')
  @Patch('templates/:id')
  updateTemplate(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.inspections.updateTemplate(ctx, id, dto);
  }

  @RequirePermission('inspections.view')
  @Get('compare')
  compare(@OrgCtx() ctx: OrgContext, @Query() query: CompareQueryDto) {
    return this.inspections.compare(ctx, query.base, query.current);
  }

  @RequirePermission('inspections.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: InspectionQueryDto) {
    return this.inspections.list(ctx, query);
  }

  @RequirePermission('inspections.view')
  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.get(ctx, id);
  }

  @RequirePermission('inspections.view')
  @Get(':id/previous')
  previous(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.previous(ctx, id);
  }

  @RequirePermission('inspections.perform')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateInspectionDto) {
    return this.inspections.create(ctx, dto);
  }

  @RequirePermission('inspections.perform')
  @Patch(':id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInspectionDto) {
    return this.inspections.update(ctx, id, dto);
  }

  @RequirePermission('inspections.perform')
  @Put(':id/items/:key')
  setItem(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('key') key: string, @Body() dto: ItemDto) {
    return this.inspections.setItem(ctx, id, key, dto);
  }

  @RequirePermission('inspections.perform')
  @Post(':id/damages')
  addDamage(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DamageDto) {
    return this.inspections.addDamage(ctx, id, dto);
  }

  @RequirePermission('inspections.perform')
  @Delete(':id/damages/:damageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDamage(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('damageId', ParseUUIDPipe) damageId: string) {
    return this.inspections.removeDamage(ctx, id, damageId);
  }

  @RequirePermission('inspections.perform')
  @Post(':id/photos')
  addPhoto(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PhotoDto) {
    return this.inspections.addPhoto(ctx, id, dto);
  }

  @RequirePermission('inspections.perform')
  @Delete(':id/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePhoto(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('photoId', ParseUUIDPipe) photoId: string) {
    return this.inspections.removePhoto(ctx, id, photoId);
  }

  @RequirePermission('inspections.perform')
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteInspectionDto) {
    return this.inspections.complete(ctx, id, dto);
  }

  @RequirePermission('inspections.approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.approve(ctx, id);
  }

  @RequirePermission('inspections.approve')
  @Post(':id/release-to-customer')
  @HttpCode(HttpStatus.OK)
  release(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.releaseToCustomer(ctx, id);
  }
}
