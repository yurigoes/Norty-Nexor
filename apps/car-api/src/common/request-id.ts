import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware (roda antes dos guards): toda requisição ganha um
 * x-request-id que acompanha a auditoria, os logs e a resposta.
 */
export function requestId(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  request.headers['x-request-id'] = id;
  response.setHeader('x-request-id', id);
  next();
}
