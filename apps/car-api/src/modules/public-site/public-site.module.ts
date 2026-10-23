import { Module } from '@nestjs/common';
import { PublicSiteController, SiteAdminController } from './public-site.controller';
import { PublicSiteService } from './public-site.service';
import { SiteAdminService } from './site-admin.service';

@Module({ controllers: [PublicSiteController, SiteAdminController], providers: [PublicSiteService, SiteAdminService] })
export class PublicSiteModule {}
