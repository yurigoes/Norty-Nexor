import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PORTA_DE_ARMAZENAMENTO, criarArmazenamento } from './armazenamento';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [ConfigModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    {
      provide: PORTA_DE_ARMAZENAMENTO,
      inject: [ConfigService],
      useFactory: criarArmazenamento,
    },
  ],
  exports: [AttachmentsService, PORTA_DE_ARMAZENAMENTO],
})
export class AttachmentsModule {}
