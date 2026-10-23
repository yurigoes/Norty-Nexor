import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, LedgerService],
  exports: [LedgerService, FinanceService],
})
export class FinanceModule {}
