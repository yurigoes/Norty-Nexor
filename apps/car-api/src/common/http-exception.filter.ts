import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma';
import type { ApiError, ApiErrorCode } from '@nortycar/shared';
import { loadConfig } from '../config/env';

/** Mensagens para unicidades conhecidas — o usuário lê o motivo, não o nome da constraint. */
const UNIQUE_MESSAGES: Record<string, string> = {
  plate: 'Já existe um veículo com esta placa.',
  renavam: 'Já existe um veículo com este RENAVAM.',
  chassis: 'Já existe um veículo com este chassi.',
  internalCode: 'Já existe um veículo com este código interno.',
  document: 'Já existe um cadastro com este documento.',
  cpf: 'Já existe um motorista com este CPF.',
  email: 'Este e-mail já está em uso.',
  sku: 'Já existe um produto com este código.',
  barcode: 'Já existe um produto com este código de barras.',
  hostname: 'Este domínio já está associado a outra conta.',
  slug: 'Este identificador de empresa já está em uso.',
  code: 'Já existe um registro com este código.',
  autoNumber: 'Esta infração já foi cadastrada.',
  competence: 'Já existe um título para esta competência.',
  name: 'Já existe um registro com este nome.',
  idempotencyKey: 'Esta operação já foi registrada.',
  providerEventId: 'Este evento de pagamento já foi processado.',
  userId: 'Este usuário já está vinculado.',
  policyNumber: 'Esta apólice já está cadastrada.',
};

/** Mensagens para restrições SQL da migração de integridade. */
const CONSTRAINT_MESSAGES: Record<string, { status: number; message: string }> = {
  vehicle_allocations_no_overlap: { status: 409, message: 'O veículo já está ocupado neste período (reserva, contrato, manutenção ou bloqueio).' },
  stock_balances_non_negative: { status: 409, message: 'Saldo insuficiente em estoque para esta saída.' },
  contract_vehicles_one_open: { status: 409, message: 'O contrato já tem um veículo vinculado em aberto.' },
  contract_drivers_one_primary_open: { status: 409, message: 'O contrato já tem um motorista principal em aberto.' },
  tires_one_per_position: { status: 409, message: 'Já existe um pneu instalado nesta posição.' },
  vehicle_sales_one_open: { status: 409, message: 'Este veículo já está anunciado para venda.' },
  vehicle_units_year_chk: { status: 422, message: 'O ano-modelo deve ser igual ao ano de fabricação ou o seguinte.' },
  reservations_period_chk: { status: 422, message: 'A devolução precisa ser posterior à retirada.' },
  rental_contracts_period_chk: { status: 422, message: 'O fim do contrato precisa ser posterior ao início.' },
  payments_amount_chk: { status: 422, message: 'O valor do pagamento precisa ser maior que zero.' },
  receivables_amount_chk: { status: 422, message: 'O valor do título precisa ser maior que zero.' },
  payables_amount_chk: { status: 422, message: 'O valor do título precisa ser maior que zero.' },
};

/**
 * Traduz qualquer exceção para o formato único de erro.
 * Em produção, erro inesperado vira mensagem genérica: stack trace e
 * texto do Postgres não saem para o cliente.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');
  private readonly isProd = loadConfig().isProd;

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno. Tente novamente em instantes.';
    let fields: Record<string, string> | undefined;
    let code: ApiErrorCode | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const payload = body as { message?: string | string[]; error?: string; code?: ApiErrorCode };
        code = payload.code;
        if (Array.isArray(payload.message)) {
          fields = Object.fromEntries(payload.message.map((m) => [m.split(' ')[0] ?? 'campo', m]));
          message = payload.message[0] ?? 'Dados inválidos.';
        } else {
          message = payload.message ?? payload.error ?? message;
        }
      }
    } else {
      const mapped = mapDatabaseError(exception);
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
      } else {
        this.logger.error(`${request.method} ${request.url} [${requestId}]`, exception instanceof Error ? exception.stack : String(exception));
        if (!this.isProd && exception instanceof Error) message = `Erro interno: ${exception.message.split('\n').slice(-1)[0]}`;
      }
    }

    const error: ApiError = { statusCode: status, code: code ?? codeFor(status), message, fields, requestId };
    response.status(status).json(error);
  }
}

export function mapDatabaseError(exception: unknown): { status: number; message: string } | null {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      const target = ([] as string[]).concat((exception.meta?.target as string[] | string) ?? []);
      const field = target.find((t) => UNIQUE_MESSAGES[t]) ?? '';
      return { status: 409, message: UNIQUE_MESSAGES[field] ?? 'Registro duplicado.' };
    }
    if (exception.code === 'P2025') return { status: 404, message: 'Registro não encontrado.' };
    if (exception.code === 'P2003') return { status: 422, message: 'Referência inválida: o registro relacionado não existe.' };
    if (exception.code === 'P2034') return { status: 409, message: 'Conflito de concorrência. Tente novamente.' };
  }
  const text = exception instanceof Error ? exception.message : '';
  if (!text) return null;
  for (const [constraint, mapped] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return mapped;
  }
  // Gatilhos de imutabilidade (RAISE ... ERRCODE P0001) trazem a própria mensagem em pt-BR.
  const raised = /(Registro imutável[^"\n]*|Pagamento registrado[^"\n]*|Movimento de caução[^"\n]*|Vistoria concluída[^"\n]*|Evidências de vistoria[^"\n]*)/.exec(text);
  if (raised) return { status: 409, message: raised[1]!.replace(/\\"/g, '').trim() };
  if (text.includes('row-level security')) return { status: 403, message: 'Operação fora do escopo da empresa.' };
  return null;
}

function codeFor(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'validation_error';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    case 503:
      return 'not_configured';
    default:
      return 'internal_error';
  }
}
