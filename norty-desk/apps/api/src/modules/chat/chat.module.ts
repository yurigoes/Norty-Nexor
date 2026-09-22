import { Global, Module } from '@nestjs/common';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * Global porque a fila de saída precisa perguntar "esta pessoa está
 * lendo ao vivo?" antes de enfileirar — e `ChannelsModule` já é
 * importado por quem importaria este.
 */
@Global()
@Module({
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
