/**
 * Configuração da API a partir do ambiente.
 *
 * A validação acontece no start e derruba o processo se algo faltar.
 * É deliberado: um contêiner que não sobe é um problema visível no
 * deploy; um que sobe sem `JWT_SECRET` é uma falha de segurança
 * silenciosa que só aparece quando alguém explora.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string;
  jwt: {
    secret: string;
    accessTtl: string;
    refreshTtlDays: number;
  };
  cors: {
    origins: string[];
  };
  cookies: {
    domain?: string;
    secure: boolean;
  };
  rateLimit: {
    ttlSeconds: number;
    limit: number;
  };
}

class MissingEnvError extends Error {
  constructor(keys: string[]) {
    super(
      `Variáveis de ambiente obrigatórias ausentes: ${keys.join(', ')}.\n` +
        'Copie infra/.env.example para infra/.env e preencha antes de subir a API.',
    );
    this.name = 'MissingEnvError';
  }
}

function required(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length) throw new MissingEnvError(missing);
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const isProd = nodeEnv === 'production';

  required(['DATABASE_URL', 'JWT_SECRET']);

  const secret = process.env.JWT_SECRET!;
  // Um segredo curto é força bruta viável. 32 caracteres é o piso.
  if (isProd && secret.length < 32) {
    throw new Error('JWT_SECRET precisa ter ao menos 32 caracteres em produção.');
  }

  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3333),
    databaseUrl: process.env.DATABASE_URL!,
    jwt: {
      secret,
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
    },
    cors: {
      origins: list(process.env.CORS_ORIGINS) .length
        ? list(process.env.CORS_ORIGINS)
        : ['http://localhost:5173'],
    },
    cookies: {
      domain: process.env.COOKIE_DOMAIN?.trim() || undefined,
      secure: isProd,
    },
    rateLimit: {
      ttlSeconds: Number(process.env.RATE_LIMIT_TTL ?? 60),
      limit: Number(process.env.RATE_LIMIT ?? 300),
    },
  };
}
