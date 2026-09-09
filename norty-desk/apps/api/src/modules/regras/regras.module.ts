import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RegrasController } from './regras.controller';
import { RegrasService } from './regras.service';

@Module({
  imports: [AuthModule],
  controllers: [RegrasController],
  providers: [RegrasService],
  exports: [RegrasService],
})
export class RegrasModule {}
