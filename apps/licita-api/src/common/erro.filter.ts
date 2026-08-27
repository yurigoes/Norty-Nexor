import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { carregarConfig } from '../config/env';

const config = carregarConfig();

/**
 * Erro inesperado em produção devolve mensagem genérica.
 *
 * Stack trace e texto do Postgres contam a estrutura do banco a
 * quem estiver sondando — nome de tabela, de coluna, de índice.
 * O detalhe vai para o log, onde é útil; para o cliente vai só o
 * identificador da ocorrência, que liga a reclamação ao log sem
 * revelar nada.
 */
@Catch()
export class ErroFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erro');

  catch(excecao: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const corpo = excecao.getResponse();

      // 5xx lançado de propósito ainda é falha nossa: registra.
      if (status >= 500) {
        this.logger.error(`${req.method} ${req.url} → ${status}`, excecao.stack);
      }

      res.status(status).json(
        typeof corpo === 'string' ? { statusCode: status, message: corpo } : corpo,
      );
      return;
    }

    const referencia = Math.random().toString(36).slice(2, 10);
    this.logger.error(
      `${req.method} ${req.url} → 500 [ref ${referencia}]`,
      excecao instanceof Error ? excecao.stack : String(excecao),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: config.producao
        ? `Erro inesperado. Se persistir, informe a referência ${referencia}.`
        : String(excecao instanceof Error ? excecao.message : excecao),
      referencia,
    });
  }
}
