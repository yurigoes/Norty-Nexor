import { Global, Module } from '@nestjs/common';

import { ThrottleService } from './throttle.service';

@Global()
@Module({
  providers: [ThrottleService],
  exports: [ThrottleService],
})
export class ThrottleModule {}
