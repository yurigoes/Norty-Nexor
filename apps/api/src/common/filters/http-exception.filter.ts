import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError, ApiErrorCode } from '@myhome/shared';

/**
 * Traduz qualquer exceção para o formato único de erro do contrato.
 *
 * Em produção, erros inesperados viram uma mensagem genérica: um stack
 * trace ou o texto cru do Postgres devolvido ao cliente entrega nomes de
 * tabela e estrutura interna a quem estiver sondando a API.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? undefined;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Erro interno. Tente novamente em instantes.';
    let fields: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const payload = body as { message?: string | string[]; error?: string };
        if (Array.isArray(payload.message)) {
          // class-validator devolve uma lista de mensagens por campo.
          fields = Object.fromEntries(
            payload.message.map((m) => [m.split(' ')[0] ?? 'campo', m]),
          );
          message = payload.message[0] ?? 'Dados inválidos.';
        } else {
          message = payload.message ?? payload.error ?? message;
        }
      }
    } else {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const error: ApiError = {
      statusCode: status,
      code: codeFor(status),
      message,
      fields,
      requestId,
    };

    response.status(status).json(error);
  }
}

function codeFor(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'validation_error';
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'not_found';
    case HttpStatus.CONFLICT:
      return 'conflict';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited';
    default:
      return 'internal_error';
  }
}
