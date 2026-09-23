import type { TipoDeCanal } from '../../api/canais';

/**
 * O formulário de cada tipo de canal.
 *
 * Descrever os campos como dado, e não como JSX por tipo, é o que
 * mantém o formulário de IMAP e o da Evolution com o mesmo
 * comportamento de segredo, de validação e de ajuda. No GLPI cada
 * coletor tem a sua própria tela, e elas divergiram.
 */
export type Campo = {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'numero' | 'segredo' | 'booleano';
  ajuda?: string;
  obrigatorio?: boolean;
  padrao?: string | number | boolean;
};

export const ROTULO_TIPO: Record<TipoDeCanal, string> = {
  EMAIL_IMAP: 'E-mail (IMAP)',
  EMAIL_SMTP: 'E-mail (envio SMTP)',
  EMAIL_WEBHOOK: 'E-mail (webhook)',
  WHATSAPP_EVOLUTION: 'WhatsApp (Evolution)',
  WHATSAPP_META: 'WhatsApp (oficial, Meta)',
};

export const DESCRICAO_TIPO: Record<TipoDeCanal, string> = {
  EMAIL_IMAP: 'Busca a caixa a cada minuto. É o caminho para caixa corporativa que não entrega por HTTP.',
  EMAIL_SMTP: 'Só saída: por onde a resposta do agente chega ao solicitante.',
  EMAIL_WEBHOOK: 'O provedor entrega a mensagem na hora, por HTTP. Preferido quando existe.',
  WHATSAPP_EVOLUTION: 'Recebe pelo webhook da Evolution e responde pela mesma instância.',
  WHATSAPP_META:
    'A porta da frente: número verificado, menu de toque e sem risco de bloqueio. ' +
    'Em troca, só responde dentro de 24 h da última mensagem da pessoa.',
};

const IMAP: Campo[] = [
  { chave: 'host', rotulo: 'Servidor', tipo: 'texto', obrigatorio: true, ajuda: 'imap.exemplo.com.br' },
  { chave: 'port', rotulo: 'Porta', tipo: 'numero', padrao: 993 },
  { chave: 'tls', rotulo: 'Conexão segura (TLS)', tipo: 'booleano', padrao: true },
  { chave: 'username', rotulo: 'Usuário', tipo: 'texto', obrigatorio: true },
  { chave: 'password', rotulo: 'Senha', tipo: 'segredo', obrigatorio: true },
  { chave: 'folder', rotulo: 'Pasta', tipo: 'texto', padrao: 'INBOX' },
  {
    chave: 'processedFolder',
    rotulo: 'Mover processadas para',
    tipo: 'texto',
    ajuda: 'Opcional. Em branco, a mensagem só é marcada como lida.',
  },
];

const SMTP: Campo[] = [
  { chave: 'host', rotulo: 'Servidor', tipo: 'texto', obrigatorio: true, ajuda: 'smtp.exemplo.com.br' },
  { chave: 'port', rotulo: 'Porta', tipo: 'numero', padrao: 587 },
  { chave: 'tls', rotulo: 'Conexão segura (TLS)', tipo: 'booleano', padrao: true },
  { chave: 'username', rotulo: 'Usuário', tipo: 'texto' },
  { chave: 'password', rotulo: 'Senha', tipo: 'segredo' },
  {
    chave: 'from',
    rotulo: 'Remetente',
    tipo: 'texto',
    obrigatorio: true,
    ajuda: 'suporte@norty.com.br — é para cá que o solicitante responde.',
  },
];

const WEBHOOK: Campo[] = [
  {
    chave: 'webhookSecret',
    rotulo: 'Segredo do webhook',
    tipo: 'segredo',
    ajuda: 'Confere a assinatura de quem entrega. Sem ele, qualquer um abre chamado por aqui.',
  },
];

const EVOLUTION: Campo[] = [
  {
    chave: 'baseUrl',
    rotulo: 'Endereço da Evolution',
    tipo: 'texto',
    obrigatorio: true,
    ajuda: 'http://192.168.15.72:8080',
  },
  { chave: 'instance', rotulo: 'Instância', tipo: 'texto', obrigatorio: true },
  { chave: 'apiKey', rotulo: 'Chave da API', tipo: 'segredo', obrigatorio: true },
  {
    chave: 'webhookSecret',
    rotulo: 'Segredo do webhook',
    tipo: 'segredo',
    ajuda: 'Opcional, mas recomendado: é o que separa a Evolution de quem só descobriu a URL.',
  },
];

/**
 * WhatsApp oficial.
 *
 * Quatro campos, todos copiados do painel da Meta — e a ordem aqui é a
 * ordem em que eles aparecem lá, para quem está configurando não ficar
 * procurando.
 *
 * O que **não** é campo: a URL do webhook. Ela é montada pela tela a
 * partir do id da conta, porque é a única coisa que vai no sentido
 * contrário — daqui para o painel da Meta.
 */
const META: Campo[] = [
  {
    chave: 'phoneNumberId',
    rotulo: 'Id do número (Phone number ID)',
    tipo: 'texto',
    obrigatorio: true,
    ajuda: 'É um número longo, e não o telefone. Meta → WhatsApp → Configuração da API.',
  },
  {
    chave: 'token',
    rotulo: 'Token permanente',
    tipo: 'segredo',
    obrigatorio: true,
    ajuda: 'O do usuário de sistema. O token temporário de 24 h serve para testar e nada mais.',
  },
  {
    chave: 'appSecret',
    rotulo: 'Chave secreta do aplicativo',
    tipo: 'segredo',
    obrigatorio: true,
    ajuda:
      'Meta → Configurações do aplicativo → Básico. É ela que prova que a entrega veio da Meta; ' +
      'sem ela o canal recusa tudo, porque a URL é pública.',
  },
  {
    chave: 'verifyToken',
    rotulo: 'Token de verificação',
    tipo: 'segredo',
    obrigatorio: true,
    ajuda: 'Você inventa esta palavra e repete a mesma no painel da Meta, ao salvar a URL.',
  },
  {
    chave: 'versao',
    rotulo: 'Versão da API',
    tipo: 'texto',
    padrao: 'v23.0',
    ajuda: 'A Meta aposenta versões antigas. Mude só quando ela avisar.',
  },
  {
    chave: 'menuAtivo',
    rotulo: 'Oferecer menu de toque',
    tipo: 'booleano',
    padrao: true,
    ajuda: 'Quem só cumprimenta recebe a lista de opções em vez de abrir um chamado chamado "Oi".',
  },
];

export const CAMPOS: Record<TipoDeCanal, Campo[]> = {
  EMAIL_IMAP: IMAP,
  EMAIL_SMTP: SMTP,
  EMAIL_WEBHOOK: WEBHOOK,
  WHATSAPP_EVOLUTION: EVOLUTION,
  WHATSAPP_META: META,
};

/** Os valores iniciais de um canal novo, já com os padrões preenchidos. */
export function padroesDe(tipo: TipoDeCanal): Record<string, unknown> {
  return Object.fromEntries(
    CAMPOS[tipo]
      .filter((campo) => campo.padrao !== undefined)
      .map((campo) => [campo.chave, campo.padrao]),
  );
}
