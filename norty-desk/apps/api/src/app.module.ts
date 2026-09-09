import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './common/prisma/prisma.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { HealthModule } from './modules/health/health.module';
import { IntakeModule } from './modules/intake/intake.module';
import { SlaModule } from './modules/sla/sla.module';
import { TicketsModule } from './modules/tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    TicketsModule,
    AttachmentsModule,
    CatalogoModule,
    BrandModule,
    SlaModule,
    ChannelsModule,
    IntakeModule,
  ],
})
export class AppModule {}
