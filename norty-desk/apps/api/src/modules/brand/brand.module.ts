import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';

@Module({
  imports: [AttachmentsModule, AuthModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
