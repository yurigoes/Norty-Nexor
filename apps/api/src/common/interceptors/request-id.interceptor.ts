import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';

/**
 * Carimba cada requisição com um identificador e o devolve no cabeçalho.
 * Quando alguém relata "deu erro às 14h", esse é o fio que liga o relato
 * à linha exata do log.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const id = (request.headers['x-request-id'] as string) || randomUUID();
    request.headers['x-request-id'] = id;
    response.setHeader('x-request-id', id);
    return next.handle();
  }
}
