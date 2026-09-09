import { ticketTag } from '@norty-desk/shared';

/**
 * O menu de comandos do WhatsApp (`docs/06-canais.md`, seção 3.4).
 *
 * O bot **não** interpreta linguagem natural. Comando explícito é
 * previsível, e previsível é o que faz o cliente confiar no canal — um
 * bot que às vezes entende "quero fechar" e às vezes não é pior que um
 * que só entende `fechar`.
 */

export type Comando =
  | { tipo: 'MENU' }
  | { tipo: 'NOVO' }
  | { tipo: 'STATUS'; numero?: number }
  | { tipo: 'FECHAR'; numero: number }
  | { tipo: 'ATENDENTE' };

/** Tira acento e caixa, para "Ajuda" e "ajuda" caírem no mesmo lugar. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function interpretarComando(texto: string): Comando | null {
  const limpo = normalizar(texto);
  if (!limpo || limpo.length > 40) return null;

  if (/^(menu|ajuda|help|\?)$/.test(limpo)) return { tipo: 'MENU' };
  if (/^(novo|abrir|novo chamado)$/.test(limpo)) return { tipo: 'NOVO' };
  if (/^(atendente|humano|pessoa|falar com alguem)$/.test(limpo)) return { tipo: 'ATENDENTE' };

  const status = /^status(?:\s+#?(\d+))?$/.exec(limpo);
  if (status) {
    return { tipo: 'STATUS', numero: status[1] ? Number(status[1]) : undefined };
  }

  const fechar = /^(?:fechar|encerrar)\s+#?(\d+)$/.exec(limpo);
  if (fechar) return { tipo: 'FECHAR', numero: Number(fechar[1]) };

  // "#1042" sozinho é escolha de chamado na desambiguação, não comando.
  return null;
}

/** O número de chamado que a pessoa mandou sozinho, ao desambiguar. */
export function numeroEscolhido(texto: string): number | null {
  const achado = /^\s*#?(\d{1,9})\s*$/.exec(texto);
  return achado ? Number(achado[1]) : null;
}

export function montarMenu(): string {
  return [
    'O que dá para fazer por aqui:',
    '',
    '*status* — seus chamados abertos',
    '*status 1042* — detalhe de um chamado',
    '*fechar 1042* — encerrar um chamado',
    '*novo* — abrir outro chamado',
    '*atendente* — falar com uma pessoa',
    '',
    'Fora isso, é só escrever: o que você mandar entra no chamado.',
  ].join('\n');
}

type ChamadoResumo = {
  number: number;
  subject: string;
  status: string;
  commitments: { dueAt: Date }[];
};

const ROTULO: Record<string, string> = {
  NOVO: 'aguardando triagem',
  ATRIBUIDO: 'em atendimento',
  PLANEJADO: 'agendado',
  PENDENTE: 'aguardando você',
  EM_APROVACAO: 'em aprovação',
  SOLUCIONADO: 'resolvido, aguardando sua confirmação',
  FECHADO: 'encerrado',
};

export function montarStatus(chamados: ChamadoResumo[], numero?: number): string {
  if (chamados.length === 0) {
    return 'Você não tem chamados abertos. É só me contar o que precisa que eu abro um.';
  }

  if (numero !== undefined) {
    const alvo = chamados.find((c) => c.number === numero);
    if (!alvo) {
      return `Não encontrei o chamado ${ticketTag(numero)} entre os seus abertos.`;
    }
    return detalhe(alvo);
  }

  if (chamados.length === 1) return detalhe(chamados[0]!);

  const linhas = chamados.map(
    (c) => `${ticketTag(c.number)} ${c.subject} — ${ROTULO[c.status] ?? c.status}`,
  );

  return [`Você tem ${chamados.length} chamados abertos:`, '', ...linhas].join('\n');
}

function detalhe(chamado: ChamadoResumo): string {
  const linhas = [
    `${ticketTag(chamado.number)} ${chamado.subject}`,
    `Situação: ${ROTULO[chamado.status] ?? chamado.status}`,
  ];

  const prazo = chamado.commitments[0]?.dueAt;
  if (prazo) {
    const restante = prazo.getTime() - Date.now();
    linhas.push(
      restante > 0
        ? `Previsão de resposta: ${formatarPrazo(restante)}`
        : 'O prazo de resposta já passou — a equipe foi avisada.',
    );
  }

  return linhas.join('\n');
}

function formatarPrazo(ms: number): string {
  const horas = Math.floor(ms / 3600_000);
  if (horas >= 24) return `em ${Math.round(horas / 24)} dia(s)`;
  if (horas >= 1) return `em ${horas} hora(s)`;
  return `em ${Math.max(1, Math.round(ms / 60_000))} minuto(s)`;
}
