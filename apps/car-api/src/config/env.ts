/**
 * Configuração da API a partir do ambiente.
 *
 * Validada no start: um contêiner que não sobe é um problema visível no
 * deploy; um que sobe sem segredo é uma falha de segurança silenciosa.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProd: boolean;
  port: number;
  databaseUrl: string;
  jwt: { secret: string; accessTtlSeconds: number; refreshTtlDays: number };
  /** Chave de 32 bytes para cifrar segredos em repouso (MFA, integrações). */
  secretsKey: Buffer;
  cors: { origins: string[] };
  cookies: { domain?: string; secure: boolean };
  rateLimit: { ttlSeconds: number; limit: number };
  appUrl: string;
  /** Domínio base dos sites das locadoras: <slug>.<siteBaseDomain>. */
  siteBaseDomain: string;
  /** Destino do CNAME dos domínios próprios. */
  siteCnameTarget: string;
  storage: { driver: 'local'; dir: string; maxUploadBytes: number };
  mfaRequiredForPlatform: boolean;
  jobs: { enabled: boolean; intervalSeconds: number };
  smtp: { host?: string; port: number; user?: string; pass?: string; from?: string };
  ai: { anthropicApiKey?: string; model: string };
  /** Contas de apresentação que podem trocar o próprio perfil (nunca use com conta real). */
  demoRoleSwitchEmails: string[];
}

function required(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}.\n` +
        'Copie apps/car-api/.env.example para apps/car-api/.env e preencha antes de subir a API.',
    );
  }
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function parseKey(raw: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('SECRETS_KEY precisa ter 32 bytes (64 caracteres hex ou base64).');
  return key;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const isProd = nodeEnv === 'production';

  required(['DATABASE_URL', 'JWT_SECRET', 'SECRETS_KEY']);
  const secret = process.env.JWT_SECRET!;
  if (isProd && secret.length < 32) throw new Error('JWT_SECRET precisa ter ao menos 32 caracteres em produção.');

  cached = {
    nodeEnv,
    isProd,
    port: Number(process.env.PORT ?? 3334),
    databaseUrl: process.env.DATABASE_URL!,
    jwt: {
      secret,
      accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
      refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 14),
    },
    secretsKey: parseKey(process.env.SECRETS_KEY!),
    cors: { origins: list(process.env.CORS_ORIGINS).length ? list(process.env.CORS_ORIGINS) : ['http://localhost:5174'] },
    cookies: { domain: process.env.COOKIE_DOMAIN?.trim() || undefined, secure: isProd },
    rateLimit: { ttlSeconds: Number(process.env.RATE_LIMIT_TTL ?? 60), limit: Number(process.env.RATE_LIMIT ?? 600) },
    appUrl: process.env.APP_URL ?? 'http://localhost:5174',
    siteBaseDomain: process.env.SITE_BASE_DOMAIN ?? 'sites.nortycar.com.br',
    siteCnameTarget: process.env.SITE_CNAME_TARGET ?? 'sites.nortycar.com.br',
    storage: {
      driver: 'local',
      dir: process.env.STORAGE_DIR ?? './storage',
      maxUploadBytes: Number(process.env.UPLOAD_MAX_MB ?? 15) * 1024 * 1024,
    },
    mfaRequiredForPlatform: (process.env.MFA_REQUIRED_PLATFORM ?? (isProd ? 'true' : 'false')) === 'true',
    jobs: {
      enabled: (process.env.JOBS_ENABLED ?? 'true') === 'true',
      intervalSeconds: Number(process.env.JOBS_INTERVAL_SECONDS ?? 900),
    },
    smtp: {
      host: process.env.SMTP_HOST || undefined,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.SMTP_FROM || undefined,
    },
    demoRoleSwitchEmails: list(process.env.DEMO_ROLE_SWITCH_EMAILS).map((e) => e.toLowerCase()),
    ai: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
      model: process.env.NORTY_AI_MODEL ?? 'claude-sonnet-5-5',
    },
  };
  return cached;
}
