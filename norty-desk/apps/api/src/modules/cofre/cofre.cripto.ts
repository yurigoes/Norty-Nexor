import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * A cifragem do cofre.
 *
 * Separada de `channels/segredos.ts` de propósito, e em três pontos:
 *
 * **1. Chave própria (`VAULT_SECRET_KEY`).** A `CHANNEL_SECRET_KEY`
 * protege senha de IMAP e chave da Evolution — coisas que o próprio
 * servidor usa o tempo todo. O cofre guarda senha de cliente. Usar a
 * mesma chave faria de qualquer vazamento dela um vazamento do cofre
 * inteiro, e obrigaria a rodar as duas juntas no dia de trocar uma.
 *
 * **2. Chave derivada por segredo.** Cada linha tem um sal aleatório, e
 * a chave que cifra aquela senha sai de `HKDF(mestra, sal)`. A chave
 * mestra nunca cifra nada diretamente: uma falha que revele uma chave
 * derivada revela uma senha, não o cofre.
 *
 * **3. O texto cifrado é amarrado à linha.** O id do segredo e o da
 * organização entram como dado autenticado (AAD) do GCM. Quem tiver
 * escrita no banco — um `UPDATE` que copie o `senhaCifrada` da linha do
 * chefe para a sua — não consegue decifrar o que copiou: a etiqueta não
 * confere. Sem isso, cifrar em repouso protegeria contra o dump do
 * banco e não contra quem escreve nele.
 *
 * O formato é `v1:<iv>:<tag>:<cifrado>`, tudo em base64url, como o dos
 * canais. O prefixo de versão existe para o dia de trocar de algoritmo
 * sem precisar adivinhar o que cada linha guarda.
 */

const PREFIXO = 'v1';

/**
 * A chave mestra, em bytes.
 *
 * Sem `VAULT_SECRET_KEY` o cofre não abre e não grava — e é assim que
 * tem de ser. Cair para a chave de canal "para não quebrar" acabaria
 * com as duas guardando tudo, que é justamente o que esta separação
 * evita.
 */
function mestra(): Buffer {
  const bruta = process.env.VAULT_SECRET_KEY;

  if (!bruta || bruta.length < 64) {
    throw new Error(
      'VAULT_SECRET_KEY ausente ou curta demais (mínimo 64 hex). ' +
        'Gere com: openssl rand -hex 32',
    );
  }

  return Buffer.from(bruta.slice(0, 64), 'hex');
}

/** O cofre está configurado nesta instalação? */
export function cofreConfigurado(): boolean {
  const bruta = process.env.VAULT_SECRET_KEY;
  return Boolean(bruta && bruta.length >= 64);
}

/** Um sal novo, para um segredo novo. */
export function novoSal(): string {
  return randomBytes(16).toString('base64url');
}

/** A chave desta linha. Nunca sai daqui, nunca é guardada. */
function chaveDoSegredo(sal: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', mestra(), Buffer.from(sal, 'base64url'), 'norty-desk/cofre/v1', 32),
  );
}

/** O que amarra o texto cifrado a esta linha e a esta organização. */
function etiqueta(secretId: string, organizationId: string): Buffer {
  return Buffer.from(`${secretId}:${organizationId}`, 'utf8');
}

export function cifrarSenha(
  texto: string,
  dados: { sal: string; secretId: string; organizationId: string },
): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', chaveDoSegredo(dados.sal), iv);
  cifrador.setAAD(etiqueta(dados.secretId, dados.organizationId));

  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);

  return [
    PREFIXO,
    iv.toString('base64url'),
    cifrador.getAuthTag().toString('base64url'),
    cifrado.toString('base64url'),
  ].join(':');
}

export function decifrarSenha(
  guardado: string,
  dados: { sal: string; secretId: string; organizationId: string },
): string {
  const [versao, iv, tag, cifrado] = guardado.split(':');

  if (versao !== PREFIXO || !iv || !tag || !cifrado) {
    throw new Error('Senha guardada em formato desconhecido.');
  }

  const decifrador = createDecipheriv(
    'aes-256-gcm',
    chaveDoSegredo(dados.sal),
    Buffer.from(iv, 'base64url'),
  );
  decifrador.setAAD(etiqueta(dados.secretId, dados.organizationId));
  decifrador.setAuthTag(Buffer.from(tag, 'base64url'));

  return Buffer.concat([
    decifrador.update(Buffer.from(cifrado, 'base64url')),
    decifrador.final(),
  ]).toString('utf8');
}
