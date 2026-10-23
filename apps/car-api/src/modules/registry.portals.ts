import type { Type } from '@nestjs/common';
import { DomainsModule } from './domains/domains.module';
import { PlatformModule } from './platform/platform.module';
import { PortalModule } from './portal/portal.module';
import { PublicSiteModule } from './public-site/public-site.module';
import { IntegrationsModule } from './integrations/integrations.module';

export const PORTAL_MODULES: Type[] = [DomainsModule, PlatformModule, PortalModule, PublicSiteModule, IntegrationsModule];
