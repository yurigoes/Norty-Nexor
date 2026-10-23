import type { Type } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { FilesModule } from './files/files.module';
import { OrganizationsModule } from './organizations/organizations.module';

export const FOUNDATION_MODULES: Type[] = [AuthModule, HealthModule, FilesModule, OrganizationsModule];
