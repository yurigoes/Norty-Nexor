import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { TimelineService } from './timeline.service';
import { CounterService } from './counter.service';
import { CryptoService } from './crypto.service';
import { MailService } from './mail.service';
import { AvailabilityService } from './availability.service';
import { VehicleStatusService } from './vehicle-status.service';
import { NotifyService } from './notify.service';
import { StorageService } from './storage.service';

/** Infraestrutura comum, disponível em todos os módulos. */
@Global()
@Module({
  providers: [PrismaService, AuditService, TimelineService, CounterService, CryptoService, MailService,
    AvailabilityService, VehicleStatusService, NotifyService, StorageService],
  exports: [PrismaService, AuditService, TimelineService, CounterService, CryptoService, MailService,
    AvailabilityService, VehicleStatusService, NotifyService, StorageService],
})
export class CoreModule {}
