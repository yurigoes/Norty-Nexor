import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { CustomersService } from './customers.service';
import {
  AsDriverDto, CreateCustomerDto, CreateDriverDto, CustomerQueryDto, DriverQueryDto, ReasonDto, UpdateCustomerDto, UpdateDriverDto,
} from './dto';

@Controller()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @RequirePermission('customers.view')
  @Get('customers')
  list(@OrgCtx() ctx: OrgContext, @Query() q: CustomerQueryDto) {
    return this.customers.list(ctx, q);
  }

  @RequirePermission('customers.create')
  @Post('customers')
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateCustomerDto) {
    return this.customers.create(ctx, dto);
  }

  @RequirePermission('customers.view')
  @Get('customers/:id')
  detail(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.detail(ctx, id);
  }

  @RequirePermission('customers.edit')
  @Patch('customers/:id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(ctx, id, dto);
  }

  @RequirePermission('customers.block')
  @Post('customers/:id/block')
  @HttpCode(HttpStatus.OK)
  block(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.customers.setBlocked(ctx, id, true, dto.reason);
  }

  @RequirePermission('customers.block')
  @Post('customers/:id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.customers.setBlocked(ctx, id, false, dto.reason);
  }

  @RequirePermission('customers.delete')
  @Post('customers/:id/anonymize')
  @HttpCode(HttpStatus.OK)
  anonymize(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.customers.anonymize(ctx, id, dto.reason);
  }

  @RequirePermission('customers.sensitive')
  @Get('customers/:id/personal-data')
  personalData(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.personalData(ctx, id);
  }

  @RequirePermission('customers.create')
  @Post('customers/:id/as-driver')
  asDriver(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AsDriverDto) {
    return this.customers.asDriver(ctx, id, dto);
  }

  @RequirePermission('customers.view')
  @Get('drivers')
  drivers(@OrgCtx() ctx: OrgContext, @Query() q: DriverQueryDto) {
    return this.customers.drivers(ctx, q);
  }

  @RequirePermission('customers.create')
  @Post('drivers')
  createDriver(@OrgCtx() ctx: OrgContext, @Body() dto: CreateDriverDto) {
    return this.customers.createDriver(ctx, dto);
  }

  @RequirePermission('customers.view')
  @Get('drivers/:id')
  driver(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.driver(ctx, id);
  }

  @RequirePermission('customers.edit')
  @Patch('drivers/:id')
  updateDriver(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.customers.updateDriver(ctx, id, dto);
  }
}
