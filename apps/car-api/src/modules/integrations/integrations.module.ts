import { Module } from '@nestjs/common';
import { IntegrationApiController, IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ApiKeyGuard } from './api-key.guard';

@Module({ controllers: [IntegrationsController, IntegrationApiController], providers: [IntegrationsService, ApiKeyGuard], exports: [IntegrationsService] })
export class IntegrationsModule {}
