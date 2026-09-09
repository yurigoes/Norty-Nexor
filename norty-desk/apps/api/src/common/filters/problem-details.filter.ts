import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ProblemDetails } from '@norty-desk/shared';
import type { Request, Response } from 'express';

/**
 * Todo erro sai em RFC 7807 (`docs/07-api.md`, seção 1).
 *
 * Em produção, erro inesperado devolve mensagem genérica — stack trace e
 * texto do Postgres não saem para o cliente.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const ehEsperado = exception instanceof HttpException;
    const status = ehEsperado ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!ehEsperado) {
      this.logger.error('Erro inesperado', exception instanceof Error ? exception.stack : exception);
    }

    const problema: ProblemDetails = {
      type: `https://desk.norty.com.br/erros/${status}`,
      title: ehEsperado ? exception.message : 'Erro interno',
      status,
      instance: request.originalUrl,
    };

    if (ehEsperado) {
      const corpo = exception.getResponse();
      if (typeof corpo === 'object' && corpo !== null) {
        const detalhes = corpo as { message?: string | string[]; error?: string };
        if (Array.isArray(detalhes.message)) {
          problema.errors = { corpo: detalhes.message };
          problema.title = 'Requisição inválida';
        } else if (detalhes.message) {
          problema.detail = detalhes.message;
        }
      }
    }

    response.status(status).type('application/problem+json').json(problema);
  }
}
