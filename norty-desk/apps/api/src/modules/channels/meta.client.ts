import { Injectable, Logger } from '@nestjs/common';

import { listaParaMeta, type ListaInterativa } from './meta.mensagem';

/**
 * Cliente da WhatsApp Cloud API (a API oficial da Meta).
 *
 * ## A diferença para a Evolution
 *
 * A Evolution usa Baileys: fala com o WhatsApp fingindo ser um celular
 * pareado. Funciona, não tem janela de 24 h nem template — e a conta
 * pode ser bloqueada sem aviso, porque é uso não previsto.
 *
 * Esta é a porta da frente: número verificado, janela de 24 h,
 * template aprovado, lista de toque, e a conta não corre risco por
 * existir. O preço é a regra: fora da janela, só template.
 *
 * ## O que este arquivo faz e o que não faz
 *
 * Fala HTTP e mais nada. Não decide se pode mandar (isso é `janela.ts`),
 * não sabe o que é chamado, não lê banco. Um cliente que decide é um
 * cliente que não dá para trocar quando a Meta mudar a versão da API —
 * e ela muda.
 */

export type ConfigMeta = {
  /** O id do número, não o número. Sai do painel da Meta. */
  phoneNumberId: string;
  /** Token permanente do app de sistema. */
  token: string;
  /** Versão da Graph API. Fica configurável porque a Meta aposenta versões. */
  versao?: string;
};

export type MidiaDaMeta = {
  bytes: Buffer;
  mimeType: string;
  filename?: string;
};

const VERSAO_PADRAO = 'v23.0';

@Injectable()
export class MetaClient {
  private readonly logger = new Logger(MetaClient.name);

  private base(config: ConfigMeta): string {
    return `https://graph.facebook.com/${config.versao || VERSAO_PADRAO}`;
  }

  /**
   * Manda para o endpoint de mensagens.
   *
   * O erro da Meta vem num envelope próprio (`error.message`,
   * `error.code`), e é ele que sobe — não o status HTTP sozinho. Um
   * "400" no diagnóstico não conta nada a quem for investigar; "o
   * número não está na lista de teste" conta tudo.
   */
  private async enviar(config: ConfigMeta, corpo: Record<string, unknown>): Promise<{ id?: string }> {
    const resposta = await fetch(`${this.base(config)}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
      signal: AbortSignal.timeout(30_000),
    });

    const json = (await resposta.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (!resposta.ok || json.error) {
      const erro = json.error;
      throw new Error(
        `Meta recusou (${resposta.status}${erro?.code ? `, código ${erro.code}` : ''}): ` +
          `${erro?.message ?? 'sem detalhe'}`,
      );
    }

    return { id: json.messages?.[0]?.id };
  }

  /** Texto livre. Só passa dentro da janela de 24 h. */
  async enviarTexto(config: ConfigMeta, telefone: string, texto: string): Promise<{ id?: string }> {
    return this.enviar(config, {
      to: MetaClient.numero(telefone),
      type: 'text',
      // `preview_url: false` de propósito: o WhatsApp buscaria a prévia
      // de qualquer link na mensagem, e um link de chamado apontaria
      // para um servidor da Meta buscando uma página nossa.
      text: { body: texto, preview_url: false },
    });
  }

  /** A lista de toque. É o que substitui o menu digitado. */
  async enviarLista(
    config: ConfigMeta,
    telefone: string,
    lista: ListaInterativa,
  ): Promise<{ id?: string }> {
    return this.enviar(config, {
      to: MetaClient.numero(telefone),
      type: 'interactive',
      interactive: listaParaMeta(lista),
    });
  }

  /**
   * Mídia, por id já enviado ao armazenamento da Meta.
   *
   * Por `id` e não por `link`: o `link` faria a Meta buscar a URL num
   * servidor nosso, o que exige que o arquivo esteja público na
   * internet. Anexo de chamado não fica público — nem por cinco
   * minutos.
   */
  async enviarMidia(
    config: ConfigMeta,
    telefone: string,
    midia: {
      tipo: 'image' | 'document' | 'audio' | 'video';
      mediaId: string;
      legenda?: string;
      filename?: string;
    },
  ): Promise<{ id?: string }> {
    // Áudio não aceita legenda na Cloud API: mandar o campo derruba a
    // mensagem inteira com 400.
    const aceitaLegenda = midia.tipo !== 'audio';

    return this.enviar(config, {
      to: MetaClient.numero(telefone),
      type: midia.tipo,
      [midia.tipo]: {
        id: midia.mediaId,
        ...(aceitaLegenda && midia.legenda ? { caption: midia.legenda } : {}),
        ...(midia.tipo === 'document' && midia.filename ? { filename: midia.filename } : {}),
      },
    });
  }

  /**
   * Um template aprovado. É o único caminho fora da janela de 24 h.
   *
   * O Desk não prospecta: o template existe para reabrir uma conversa
   * que **a pessoa** começou e que passou de 24 h — "seu chamado foi
   * resolvido", por exemplo, três dias depois.
   */
  async enviarTemplate(
    config: ConfigMeta,
    telefone: string,
    template: { nome: string; idioma?: string; parametros?: string[] },
  ): Promise<{ id?: string }> {
    return this.enviar(config, {
      to: MetaClient.numero(telefone),
      type: 'template',
      template: {
        name: template.nome,
        language: { code: template.idioma || 'pt_BR' },
        ...(template.parametros?.length
          ? {
              components: [
                {
                  type: 'body',
                  parameters: template.parametros.map((p) => ({ type: 'text', text: p })),
                },
              ],
            }
          : {}),
      },
    });
  }

  /**
   * Baixa uma mídia recebida. São **dois** passos, e nunca um só.
   *
   * O webhook traz só o id. O primeiro `GET` devolve uma URL assinada
   * de vida curta; o segundo busca os bytes — e esse segundo também
   * exige o `Authorization`, o que surpreende quem esperava uma URL
   * pública. Sem o cabeçalho, a Meta devolve 401 numa URL que parece
   * aberta.
   */
  async baixarMidia(config: ConfigMeta, mediaId: string): Promise<MidiaDaMeta> {
    const meta = await fetch(`${this.base(config)}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!meta.ok) {
      throw new Error(`Meta não descreveu a mídia ${mediaId}: ${meta.status}`);
    }

    const descricao = (await meta.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };

    if (!descricao.url) throw new Error(`Meta não devolveu URL para a mídia ${mediaId}.`);

    const binario = await fetch(descricao.url, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(60_000),
    });

    if (!binario.ok) {
      throw new Error(`Meta não entregou os bytes da mídia ${mediaId}: ${binario.status}`);
    }

    return {
      bytes: Buffer.from(await binario.arrayBuffer()),
      mimeType: descricao.mime_type ?? binario.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  /**
   * Sobe um arquivo e devolve o `media_id` para mandar depois.
   *
   * O id vale 30 dias no armazenamento da Meta. Subir a cada envio é o
   * certo mesmo assim: guardar o id aqui criaria uma segunda verdade
   * sobre o anexo, que já mora no nosso armazenamento.
   */
  async subirMidia(
    config: ConfigMeta,
    arquivo: { bytes: Buffer; mimeType: string; filename: string },
  ): Promise<string> {
    const forma = new FormData();
    forma.append('messaging_product', 'whatsapp');
    forma.append('type', arquivo.mimeType);
    forma.append(
      'file',
      new Blob([new Uint8Array(arquivo.bytes)], { type: arquivo.mimeType }),
      arquivo.filename,
    );

    const resposta = await fetch(`${this.base(config)}/${config.phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
      body: forma,
      signal: AbortSignal.timeout(60_000),
    });

    const json = (await resposta.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!resposta.ok || !json.id) {
      throw new Error(`Meta recusou o arquivo: ${json.error?.message ?? resposta.status}`);
    }

    return json.id;
  }

  /**
   * "Visto" — as duas marcas azuis.
   *
   * Vale mais do que parece: sem isto, quem escreve fica olhando uma
   * mensagem entregue e sem resposta, sem saber se chegou a alguém.
   * Falha em silêncio de propósito — um recibo que não saiu não pode
   * derrubar o processamento da mensagem.
   */
  async marcarComoLida(config: ConfigMeta, messageId: string): Promise<void> {
    try {
      await this.enviar(config, { status: 'read', message_id: messageId });
    } catch (erro) {
      this.logger.debug(`Não consegui marcar ${messageId} como lida: ${String(erro)}`);
    }
  }

  /** Testa a credencial: descreve o próprio número. Usado pelo botão "testar". */
  async estadoDoNumero(
    config: ConfigMeta,
  ): Promise<{ ok: boolean; numero?: string; nome?: string; motivo?: string }> {
    try {
      const resposta = await fetch(
        `${this.base(config)}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        {
          headers: { Authorization: `Bearer ${config.token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );

      const json = (await resposta.json().catch(() => ({}))) as {
        display_phone_number?: string;
        verified_name?: string;
        error?: { message?: string };
      };

      if (!resposta.ok) {
        return { ok: false, motivo: json.error?.message ?? `Meta respondeu ${resposta.status}.` };
      }

      return { ok: true, numero: json.display_phone_number, nome: json.verified_name };
    } catch (erro) {
      return { ok: false, motivo: `Não consegui falar com a Meta: ${String(erro)}` };
    }
  }

  /** A Meta quer o número só com dígitos, sem `+`. */
  private static numero(telefone: string): string {
    return telefone.replace(/\D/g, '');
  }
}
