import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { OrdemController } from './ordem.controller';
import { OrdemService } from './ordem.service';

@Module({
  imports: [AttachmentsModule],
  controllers: [OrdemController],
  providers: [OrdemService],
  exports: [OrdemService],
})
export class OrdemModule {}
