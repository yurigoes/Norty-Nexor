import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MaintenanceController, WorkOrdersController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [InventoryModule],
  controllers: [WorkOrdersController, MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
