import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { InventoryService } from './inventory.service';
import {
  CategoryDto, ConsumptionQueryDto, CountOpenDto, CountUpdateDto, LocationDto, MovementDto, MovementQueryDto, ProductDto,
  ProductQueryDto, PurchaseOrderDto, PurchaseQueryDto, ReasonDto, ReceiveDto, ReverseDto, TransferDto, UpdateLocationDto,
  UpdateProductDto,
} from './dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission('inventory.view')
  @Get('categories')
  categories(@OrgCtx() ctx: OrgContext) {
    return this.inventory.categories(ctx);
  }

  @RequirePermission('inventory.manage')
  @Post('categories')
  createCategory(@OrgCtx() ctx: OrgContext, @Body() dto: CategoryDto) {
    return this.inventory.createCategory(ctx, dto);
  }

  @RequirePermission('inventory.view')
  @Get('locations')
  locations(@OrgCtx() ctx: OrgContext) {
    return this.inventory.locations(ctx);
  }

  @RequirePermission('inventory.manage')
  @Post('locations')
  createLocation(@OrgCtx() ctx: OrgContext, @Body() dto: LocationDto) {
    return this.inventory.createLocation(ctx, dto);
  }

  @RequirePermission('inventory.manage')
  @Patch('locations/:id')
  updateLocation(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLocationDto) {
    return this.inventory.updateLocation(ctx, id, dto);
  }

  @RequirePermission('inventory.view')
  @Get('products')
  products(@OrgCtx() ctx: OrgContext, @Query() query: ProductQueryDto) {
    return this.inventory.products(ctx, query);
  }

  @RequirePermission('inventory.view')
  @Get('products/:id')
  product(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.product(ctx, id);
  }

  @RequirePermission('inventory.manage')
  @Post('products')
  createProduct(@OrgCtx() ctx: OrgContext, @Body() dto: ProductDto) {
    return this.inventory.createProduct(ctx, dto);
  }

  @RequirePermission('inventory.manage')
  @Patch('products/:id')
  updateProduct(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.inventory.updateProduct(ctx, id, dto);
  }

  @RequirePermission('inventory.view')
  @Get('movements')
  movements(@OrgCtx() ctx: OrgContext, @Query() query: MovementQueryDto) {
    return this.inventory.movements(ctx, query);
  }

  @RequirePermission('inventory.move')
  @Post('movements')
  move(@OrgCtx() ctx: OrgContext, @Body() dto: MovementDto) {
    return this.inventory.move(ctx, dto);
  }

  @RequirePermission('inventory.move')
  @Post('transfers')
  transfer(@OrgCtx() ctx: OrgContext, @Body() dto: TransferDto) {
    return this.inventory.transfer(ctx, dto);
  }

  @RequirePermission('inventory.adjust')
  @Post('movements/:id/reverse')
  reverse(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDto) {
    return this.inventory.reverse(ctx, id, dto.reason, dto.idempotencyKey);
  }

  @RequirePermission('inventory.view')
  @Get('replenishment')
  replenishment(@OrgCtx() ctx: OrgContext) {
    return this.inventory.replenishment(ctx);
  }

  @RequirePermission('inventory.view')
  @Get('consumption')
  consumption(@OrgCtx() ctx: OrgContext, @Query() query: ConsumptionQueryDto) {
    return this.inventory.consumption(ctx, query);
  }

  @RequirePermission('inventory.view')
  @Get('counts')
  counts(@OrgCtx() ctx: OrgContext) {
    return this.inventory.counts(ctx);
  }

  @RequirePermission('inventory.view')
  @Get('counts/:id')
  count(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.count(ctx, id);
  }

  @RequirePermission('inventory.adjust')
  @Post('counts')
  openCount(@OrgCtx() ctx: OrgContext, @Body() dto: CountOpenDto) {
    return this.inventory.openCount(ctx, dto);
  }

  @RequirePermission('inventory.adjust')
  @Patch('counts/:id')
  updateCount(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CountUpdateDto) {
    return this.inventory.updateCount(ctx, id, dto);
  }

  @RequirePermission('inventory.adjust')
  @Post('counts/:id/apply')
  @HttpCode(HttpStatus.OK)
  applyCount(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.applyCount(ctx, id);
  }

  @RequirePermission('inventory.adjust')
  @Post('counts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelCount(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.cancelCount(ctx, id);
  }
}

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission('inventory.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: PurchaseQueryDto) {
    return this.inventory.purchases(ctx, query);
  }

  @RequirePermission('inventory.view')
  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.purchase(ctx, id);
  }

  @RequirePermission('purchases.manage')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: PurchaseOrderDto) {
    return this.inventory.createPurchase(ctx, dto);
  }

  @RequirePermission('purchases.manage')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.submitPurchase(ctx, id);
  }

  @RequirePermission('purchases.approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.approvePurchase(ctx, id);
  }

  @RequirePermission('purchases.manage')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.inventory.cancelPurchase(ctx, id, dto.reason);
  }

  @RequirePermission('inventory.move')
  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  receive(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveDto) {
    return this.inventory.receive(ctx, id, dto);
  }
}
