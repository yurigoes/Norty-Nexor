import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifragem dos segredos de canal.
 *
 * Senha de IMAP e chave da Evolution ficam no banco, em `config`. Em
 * texto claro, qualquer leitura do banco — um dump, um backup, um
 * `SELECT` de quem tem acesso de leitura — entrega a caixa de e-mail e
 * o WhatsApp da empresa. Cifrado, entrega um blob inútil sem a chave,
 * que mora na variável de ambiente.
 *
 * AES-256-GCM: cifra e autentica. Sem a autenticação, alguém com acesso
 * de escrita ao banco poderia trocar bytes do texto cifrado e o
 * resultado decifraria em lixo — ou, com paciência, em outra coisa.
 *
 * O formato é `v1:<iv>:<tag>:<cifrado>`, tudo em base64url. O prefixo de
 * versão existe para o dia de trocar de algoritmo sem precisar
 * adivinhar o que cada linha guarda.
 */

const PREFIXO = 'v1';

function chave(): Buffer {
  const bruta = process.env.CHANNEL_SECRET_KEY;

  if (!bruta || bruta.length < 64) {
    throw new Error(
      'CHANNEL_SECRET_KEY ausente ou curta demais (mínimo 64 hex). ' +
        'Gere com: openssl rand -hex 32',
    );
  }

  return Buffer.from(bruta.slice(0, 64), 'hex');
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', chave(), iv);

  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();

  return [
    PREFIXO,
    iv.toString('base64url'),
    tag.toString('base64url'),
    cifrado.toString('base64url'),
  ].join(':');
}

export function decifrar(guardado: string): string {
  const partes = guardado.split(':');

  if (partes.length !== 4 || partes[0] !== PREFIXO) {
    throw new Error('Segredo em formato desconhecido.');
  }

  const [, iv, tag, cifrado] = partes;

  const decifrador = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv!, 'base64url'));
  decifrador.setAuthTag(Buffer.from(tag!, 'base64url'));

  return Buffer.concat([
    decifrador.update(Buffer.from(cifrado!, 'base64url')),
    decifrador.final(),
  ]).toString('utf8');
}

/** Já está cifrado? Serve para não cifrar duas vezes numa edição. */
export function ehCifrado(valor: unknown): boolean {
  return typeof valor === 'string' && valor.startsWith(`${PREFIXO}:`);
}

/** As chaves de `config` que guardam segredo. */
const CAMPOS_SECRETOS = ['password', 'apiKey', 'webhookSecret', 'secret', 'token'];

/** Cifra os campos secretos de uma configuração de canal. */
export function cifrarConfig(config: Record<string, unknown>): Record<string, unknown> {
  const saida = { ...config };

  for (const campo of CAMPOS_SECRETOS) {
    const valor = saida[campo];
    if (typeof valor === 'string' && valor && !ehCifrado(valor)) {
      saida[campo] = cifrar(valor);
    }
  }

  return saida;
}

/** Decifra os campos secretos para uso. */
export function decifrarConfig(config: Record<string, unknown>): Record<string, unknown> {
  const saida = { ...config };

  for (const campo of CAMPOS_SECRETOS) {
    const valor = saida[campo];
    if (ehCifrado(valor)) saida[campo] = decifrar(valor as string);
  }

  return saida;
}

/**
 * A configuração como ela pode ser mostrada na tela.
 *
 * O segredo vira `true`/`false`: a tela precisa saber se existe senha,
 * não qual é. Devolver o valor cifrado também não serve — quem tiver a
 * chave o decifra, e a tela não tem por que carregá-lo.
 */
export function configParaExibicao(config: Record<string, unknown>): Record<string, unknown> {
  const saida = { ...config };

  for (const campo of CAMPOS_SECRETOS) {
    if (campo in saida) saida[campo] = Boolean(saida[campo]);
  }

  return saida;
}
