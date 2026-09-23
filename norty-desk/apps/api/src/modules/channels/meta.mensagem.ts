import {
  LISTA_META,
  TOQUE_ATENDENTE,
  TOQUE_CHAMADO,
  TOQUE_EMPRESA,
  TOQUE_NOVO,
  TOQUE_STATUS,
  cortarPara,
  normalizePhone,
  ticketTag,
  type MetaMensagemRecebida,
  type MetaWebhookRequest,
} from '@norty-desk/shared';

/**
 * A tradução entre o formato da Meta e o nosso.
 *
 * Tudo aqui é função pura: entra JSON, sai estrutura. Nenhuma linha
 * fala com banco ou com a rede, e é por isso que dá para provar o
 * formato inteiro sem subir nada — que é o que a suíte faz. O formato
 * da Meta é a parte que mais muda e a que menos se enxerga em produção;
 * deixá-lo testável sozinho é o que evita descobrir uma mudança pelo
 * chamado que não abriu.
 */

/** Uma mensagem da Meta já achatada, do jeito que o Desk usa. */
export type MensagemDaMeta = {
  /** `wamid...` — único, e é a chave de idempotência. */
  externalId: string;
  /** E.164, com o `+`. */
  telefone: string;
  /** O nome do perfil do WhatsApp, quando a Meta o manda. */
  nome?: string;
  recebidaEm: Date;
  /** O texto, ou a legenda da mídia, ou o título do que a pessoa tocou. */
  texto?: string;
  /** A mídia a buscar depois, se houver. */
  midia?: { id: string; mimeType?: string; filename?: string; ehAudio: boolean };
  /** O `id` da linha tocada numa lista nossa. */
  toque?: string;
  /** O id da mensagem citada, quando a pessoa respondeu a uma anterior. */
  citando?: string;
  /** O tipo cru, para o diagnóstico. */
  tipo: string;
};

/**
 * Achata `entry[].changes[].value.messages[]` numa lista.
 *
 * Uma entrega pode trazer várias mensagens — a Meta agrupa quando
 * chegam juntas — e pode trazer só recibo de entrega, sem mensagem
 * nenhuma. Tratar a entrega como "uma mensagem" perderia a segunda em
 * silêncio, que é o tipo de perda que ninguém percebe até o cliente
 * reclamar que mandou e não abriu chamado.
 */
export function lerEntrega(corpo: MetaWebhookRequest): MensagemDaMeta[] {
  const saida: MensagemDaMeta[] = [];

  for (const entrada of corpo.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value;
      if (!valor?.messages?.length) continue;

      // O nome do perfil vem numa lista à parte, casada por `wa_id`.
      const nomes = new Map<string, string>();
      for (const contato of valor.contacts ?? []) {
        if (contato.wa_id && contato.profile?.name) nomes.set(contato.wa_id, contato.profile.name);
      }

      for (const bruta of valor.messages) {
        const lida = lerMensagem(bruta, nomes);
        if (lida) saida.push(lida);
      }
    }
  }

  return saida;
}

function lerMensagem(
  bruta: MetaMensagemRecebida,
  nomes: Map<string, string>,
): MensagemDaMeta | null {
  if (!bruta.id || !bruta.from) return null;

  const base = {
    externalId: bruta.id,
    // A Meta manda o número sem `+`. `normalizePhone` põe o `+55`
    // quando falta, que é o mesmo caminho do canal antigo.
    telefone: normalizePhone(bruta.from),
    nome: nomes.get(bruta.from),
    // O carimbo vem em **segundos**, como string. Lido como
    // milissegundos, toda mensagem chegaria de 1970 — e a janela de
    // 24 h nunca abriria.
    recebidaEm: bruta.timestamp ? new Date(Number(bruta.timestamp) * 1000) : new Date(),
    citando: bruta.context?.id,
    tipo: bruta.type ?? 'desconhecido',
  };

  switch (bruta.type) {
    case 'text':
      return { ...base, texto: bruta.text?.body };

    case 'interactive': {
      const toque = bruta.interactive?.list_reply ?? bruta.interactive?.button_reply;
      return {
        ...base,
        toque: toque?.id,
        // O título tocado vira texto para o diagnóstico mostrar o que a
        // pessoa escolheu em vez de um id.
        texto: toque?.title,
      };
    }

    case 'image':
    case 'video':
      return {
        ...base,
        texto: bruta[bruta.type]?.caption,
        midia: bruta[bruta.type]?.id
          ? { id: bruta[bruta.type]!.id!, mimeType: bruta[bruta.type]?.mime_type, ehAudio: false }
          : undefined,
      };

    case 'audio':
      return {
        ...base,
        midia: bruta.audio?.id
          ? { id: bruta.audio.id, mimeType: bruta.audio.mime_type, ehAudio: true }
          : undefined,
      };

    case 'document':
      return {
        ...base,
        texto: bruta.document?.caption,
        midia: bruta.document?.id
          ? {
              id: bruta.document.id,
              mimeType: bruta.document.mime_type,
              filename: bruta.document.filename,
              ehAudio: false,
            }
          : undefined,
      };

    case 'location': {
      const l = bruta.location;
      if (!l) return { ...base };
      // Vira texto, e não anexo: o que interessa a quem atende é o
      // endereço legível, não um par de coordenadas num arquivo.
      const partes = [l.name, l.address, `${l.latitude}, ${l.longitude}`].filter(Boolean);
      return { ...base, texto: `Localização enviada: ${partes.join(' — ')}` };
    }

    // Figurinha e o que mais vier: a mensagem existe, e o chamado
    // registra que algo chegou. Descartar em silêncio faria a pessoa
    // achar que mandou e ninguém viu.
    default:
      return { ...base };
  }
}

// ---------------------------------------------------------------------
// O que o bot manda
// ---------------------------------------------------------------------

/** Uma lista interativa, no formato que a Meta aceita. */
export type ListaInterativa = {
  corpo: string;
  botao: string;
  secoes: { titulo?: string; linhas: { id: string; titulo: string; descricao?: string }[] }[];
};

/**
 * O menu principal, como lista de toque.
 *
 * É a diferença entre o canal da Evolution e este: lá a pessoa
 * **digita** `status`, e quem digita erra — "Status", "status?",
 * "ver status". Aqui ela toca, e a resposta volta com o id exato da
 * linha. O texto de comando continua funcionando (quem já conhece
 * digita), mas não é mais o caminho principal.
 */
export function menuDeToque(comChamadosAbertos: boolean): ListaInterativa {
  const linhas = [
    {
      id: TOQUE_NOVO,
      titulo: 'Abrir um chamado',
      descricao: 'Conte o problema e a equipe assume daqui',
    },
  ];

  // "Ver meus chamados" só aparece quando há algum. Um menu que oferece
  // o que não existe faz a pessoa tocar e receber "você não tem nada",
  // e ela aprende a não tocar mais.
  if (comChamadosAbertos) {
    linhas.push({
      id: TOQUE_STATUS,
      titulo: 'Ver meus chamados',
      descricao: 'Situação e previsão de resposta',
    });
  }

  linhas.push({
    id: TOQUE_ATENDENTE,
    titulo: 'Falar com uma pessoa',
    descricao: 'Abre um chamado e chama a equipe',
  });

  return {
    corpo: 'Olá! Sou o atendimento da Norty. O que você precisa hoje?',
    botao: 'Escolher',
    secoes: [{ linhas }],
  };
}

/**
 * A lista de empresas, para quem trabalha em mais de uma.
 *
 * O chamado precisa nascer na empresa certa: é ela que decide contrato,
 * SLA e quem enxerga. Adivinhar pela primeira que aparecer erraria
 * silenciosamente, e o erro só apareceria no relatório do mês.
 */
export function listaDeEmpresas(
  empresas: { id: string; nome: string }[],
): ListaInterativa {
  return {
    corpo:
      'Você está cadastrado em mais de uma empresa. ' +
      'Para qual delas é este chamado?',
    botao: 'Escolher empresa',
    secoes: [
      {
        linhas: empresas.slice(0, LISTA_META.maxLinhas).map((e) => ({
          id: `${TOQUE_EMPRESA}${e.id}`,
          titulo: e.nome,
        })),
      },
    ],
  };
}

/** A lista de chamados abertos, quando o bot precisa desambiguar. */
export function listaDeChamados(
  chamados: { number: number; subject: string; status: string }[],
  pergunta = 'Você tem mais de um chamado aberto. Sobre qual é esta mensagem?',
): ListaInterativa {
  return {
    corpo: pergunta,
    botao: 'Escolher chamado',
    secoes: [
      {
        linhas: chamados.slice(0, LISTA_META.maxLinhas).map((c) => ({
          id: `${TOQUE_CHAMADO}${c.number}`,
          titulo: `${ticketTag(c.number)} ${c.subject}`,
          descricao: c.status,
        })),
      },
    ],
  };
}

/**
 * A lista no corpo que a Meta aceita, com todo campo já cortado.
 *
 * A Meta recusa a mensagem inteira com 400 quando um campo passa do
 * limite, e a resposta não diz **qual** campo passou. Cortar aqui é
 * mais barato que descobrir lá — e o assunto de um chamado passa dos
 * 24 caracteres quase sempre.
 */
export function listaParaMeta(lista: ListaInterativa): Record<string, unknown> {
  // O limite de 10 linhas é da mensagem inteira, não de cada seção:
  // contar por seção deixaria passar 3 seções de 5.
  let restantes = LISTA_META.maxLinhas;
  const secoes: Record<string, unknown>[] = [];

  for (const secao of lista.secoes) {
    if (restantes <= 0) break;
    const linhas = secao.linhas.slice(0, restantes);
    restantes -= linhas.length;

    secoes.push({
      ...(secao.titulo ? { title: cortarPara(secao.titulo, LISTA_META.tituloDaSecao) } : {}),
      rows: linhas.map((l) => ({
        id: l.id,
        title: cortarPara(l.titulo, LISTA_META.tituloDaLinha),
        ...(l.descricao
          ? { description: cortarPara(l.descricao, LISTA_META.descricaoDaLinha) }
          : {}),
      })),
    });
  }

  return {
    type: 'list',
    body: { text: cortarPara(lista.corpo, LISTA_META.corpo) },
    action: {
      button: cortarPara(lista.botao, LISTA_META.textoDoBotao),
      sections: secoes,
    },
  };
}

/**
 * A mesma lista em texto.
 *
 * Toda lista tem uma versão escrita, e não é enfeite: é o que sai
 * quando o transporte não sabe desenhar lista (a Evolution não sabe), e
 * é o que fica legível na tela de diagnóstico e no banco. Um `payload`
 * sem texto equivalente seria uma mensagem que ninguém consegue ler
 * depois.
 */
export function listaEmTexto(lista: ListaInterativa): string {
  const linhas: string[] = [lista.corpo, ''];

  for (const secao of lista.secoes) {
    if (secao.titulo) linhas.push(`*${secao.titulo}*`);
    for (const l of secao.linhas) {
      linhas.push(l.descricao ? `• ${l.titulo} — ${l.descricao}` : `• ${l.titulo}`);
    }
  }

  return linhas.join('\n').trim();
}

/** O que a pessoa tocou, já interpretado. */
export type Toque =
  | { tipo: 'NOVO' }
  | { tipo: 'STATUS' }
  | { tipo: 'ATENDENTE' }
  | { tipo: 'EMPRESA'; clientId: string }
  | { tipo: 'CHAMADO'; numero: number };

export function interpretarToque(id: string | undefined): Toque | null {
  if (!id) return null;

  if (id === TOQUE_NOVO) return { tipo: 'NOVO' };
  if (id === TOQUE_STATUS) return { tipo: 'STATUS' };
  if (id === TOQUE_ATENDENTE) return { tipo: 'ATENDENTE' };

  if (id.startsWith(TOQUE_EMPRESA)) {
    const clientId = id.slice(TOQUE_EMPRESA.length);
    return clientId ? { tipo: 'EMPRESA', clientId } : null;
  }

  if (id.startsWith(TOQUE_CHAMADO)) {
    const numero = Number(id.slice(TOQUE_CHAMADO.length));
    return Number.isInteger(numero) && numero > 0 ? { tipo: 'CHAMADO', numero } : null;
  }

  return null;
}
