import { Global, Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

@Global()
@Module({ controllers: [DomainsController], providers: [DomainsService], exports: [DomainsService] })
export class DomainsModule {}
