/* =========================================================
   LICITA+ API — Configuração
   ---------------------------------------------------------
   Toda variável de ambiente entra por aqui e sai tipada. O que
   é segredo é exigido em produção e falha na subida, não no
   primeiro uso: uma API que sobe sem JWT_SECRET e só quebra no
   primeiro login é pior do que uma que não sobe.
   ========================================================= */

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  producao: boolean;
  porta: number;
  urlApp: string;

  jwt: {
    segredo: string;
    /// Em segundos. O `expiresIn` do jsonwebtoken aceita número
    /// (segundos) ou string com sufixo; número não tem ambiguidade.
    accessTtlSegundos: number;
    refreshTtlDias: number;
  };

  cookie: {
    dominio?: string;
    seguro: boolean;
  };

  cors: { origens: string[] };

  smtp: {
    ativo: boolean;
    host: string;
    porta: number;
    seguro: boolean;
    usuario: string;
    senha: string;
    remetente: string;
  };

  pncp: {
    base: string;
    janelaDias: number;
    ufs: string[];
  };
}

let cache: Config | null = null;

function exigir(nome: string, producao: boolean, padrao?: string): string {
  const valor = process.env[nome] ?? padrao;
  if (valor === undefined || valor === '') {
    if (producao) {
      throw new Error(
        `${nome} não está definida. Em produção a API não sobe sem ela — ` +
          'preencha o .env antes de iniciar.',
      );
    }
    return `dev-${nome.toLowerCase()}`;
  }
  return valor;
}

/** "15m" → 900. Aceita s, m, h, d; sem sufixo assume segundos. */
function emSegundos(ttl: string): number {
  const achou = ttl.trim().match(/^(\d+)\s*([smhd])?$/);
  if (!achou) throw new Error(`JWT_ACCESS_TTL inválido: "${ttl}". Use algo como 15m ou 900.`);
  const n = Number(achou[1]);
  return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[achou[2] ?? 's'] ?? n;
}

/**
 * Variável ausente e variável vazia são a mesma coisa aqui.
 *
 * A distinção parece acadêmica e não é: o docker-compose declara
 * `SMTP_SECURE: ${SMTP_SECURE:-}`, que **define** a variável com
 * string vazia quando o .env não a traz. Um `=== undefined`
 * nunca dispara nesse arranjo, e a dedução pela porta —
 * justamente o que evita a combinação que trava o envio — ficava
 * morta em produção enquanto passava em qualquer teste local.
 */
const texto = (nome: string): string | undefined => {
  const valor = process.env[nome]?.trim();
  return valor === '' ? undefined : valor;
};

const lista = (valor: string | undefined): string[] =>
  (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function carregarConfig(): Config {
  if (cache) return cache;

  const nodeEnv = (process.env.NODE_ENV ?? 'development') as Config['nodeEnv'];
  const producao = nodeEnv === 'production';

  const segredo = exigir('JWT_SECRET', producao);
  if (producao && segredo.length < 32) {
    throw new Error('JWT_SECRET curto demais. Gere com: openssl rand -base64 48');
  }

  const smtpHost = (process.env.SMTP_HOST ?? '').trim();
  const smtpPorta = Number(texto('SMTP_PORT') ?? 465);

  cache = {
    nodeEnv,
    producao,
    porta: Number(process.env.PORT ?? 3501),
    urlApp: process.env.APP_URL ?? 'https://licita.norty.com.br',

    jwt: {
      segredo,
      accessTtlSegundos: emSegundos(process.env.JWT_ACCESS_TTL ?? '15m'),
      refreshTtlDias: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
    },

    cookie: {
      dominio: process.env.COOKIE_DOMAIN || undefined,
      // Em desenvolvimento o navegador recusaria cookie `Secure`
      // sobre http://localhost, e o login pareceria quebrado.
      seguro: producao,
    },

    cors: {
      origens: lista(process.env.CORS_ORIGINS).length
        ? lista(process.env.CORS_ORIGINS)
        : ['https://licita.norty.com.br', 'http://localhost:5180'],
    },

    smtp: {
      // Sem host configurado o envio não falha: ele registra no log
      // e segue. É o que permite subir a API antes do SMTP estar
      // pronto sem travar o cadastro inteiro.
      ativo: smtpHost !== '',
      host: smtpHost,
      porta: smtpPorta,
      // A porta decide o modo quando ninguém disse o contrário. A 465
      // é TLS implícito: o servidor espera o handshake antes de
      // qualquer texto. Tentar STARTTLS nela deixa os dois lados
      // esperando um pelo outro até o timeout — e o sintoma é
      // "Greeting never received", nunca "o modo está errado".
      seguro: texto('SMTP_SECURE') === undefined
        ? smtpPorta === 465
        : texto('SMTP_SECURE') === 'true',
      usuario: process.env.SMTP_USER ?? '',
      senha: process.env.SMTP_PASS ?? '',
      remetente: process.env.SMTP_FROM ?? 'LICITA+ <nao-responda@norty.com.br>',
    },

    pncp: {
      base: process.env.PNCP_BASE ?? 'https://pncp.gov.br/api/consulta',
      janelaDias: Number(process.env.PNCP_JANELA_DIAS ?? 30),
      ufs: lista(process.env.PNCP_UFS).length ? lista(process.env.PNCP_UFS) : ['BA', 'SE', 'PE'],
    },
  };

  return cache;
}
