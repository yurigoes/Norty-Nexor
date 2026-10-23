import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalAccessController, PortalController, ServiceRequestsController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({ imports: [AuthModule], controllers: [PortalController, ServiceRequestsController, PortalAccessController], providers: [PortalService] })
export class PortalModule {}
