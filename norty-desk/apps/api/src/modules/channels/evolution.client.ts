import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente da Evolution API (CT 102 Yggdrasil, 192.168.15.72:8080).
 *
 * A Evolution usa Baileys, não a API oficial da Meta: não há janela de
 * 24 h nem template aprovado, mas a conta corre risco de bloqueio se
 * houver disparo em massa. Por isso o Desk **só responde a quem falou
 * primeiro** (`docs/06-canais.md`, seção 3.7).
 */
export type ConfigEvolution = {
  baseUrl: string;
  instance: string;
  apiKey: string;
};

export type MidiaRecebida = {
  base64: string;
  mimetype: string;
  fileName?: string;
};

@Injectable()
export class EvolutionClient {
  private readonly logger = new Logger(EvolutionClient.name);

  private async chamar<T>(config: ConfigEvolution, caminho: string, corpo: unknown): Promise<T> {
    const resposta = await fetch(`${config.baseUrl}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new Error(`Evolution respondeu ${resposta.status} em ${caminho}: ${texto.slice(0, 300)}`);
    }

    return (await resposta.json()) as T;
  }

  /** Envia texto. Toda mensagem começa com `[#numero]`. */
  async enviarTexto(config: ConfigEvolution, telefone: string, texto: string): Promise<{ key?: { id?: string } }> {
    return this.chamar(config, `/message/sendText/${config.instance}`, {
      number: telefone.replace(/\D/g, ''),
      text: texto,
    });
  }

  /** Envia arquivo. `media` aceita base64 ou URL assinada do MinIO. */
  async enviarMidia(
    config: ConfigEvolution,
    telefone: string,
    midia: { mediatype: 'image' | 'document' | 'video' | 'audio'; fileName: string; media: string; caption?: string },
  ): Promise<{ key?: { id?: string } }> {
    return this.chamar(config, `/message/sendMedia/${config.instance}`, {
      number: telefone.replace(/\D/g, ''),
      ...midia,
    });
  }

  /**
   * Busca o binário de uma mídia recebida.
   *
   * O webhook não traz o arquivo — só a referência. É este passo que
   * permite "adicionar arquivo em chamado" pelo WhatsApp
   * (`docs/06-canais.md`, seção 3.5).
   */
  async baixarMidia(config: ConfigEvolution, messageId: string): Promise<MidiaRecebida> {
    return this.chamar(config, `/chat/getBase64FromMediaMessage/${config.instance}`, {
      message: { key: { id: messageId } },
      convertToMp4: false,
    });
  }

  /** Estado do pareamento da instância. Usado pelo botão "testar". */
  async estadoDaConexao(config: ConfigEvolution): Promise<{ state?: string }> {
    const resposta = await fetch(`${config.baseUrl}/instance/connectionState/${config.instance}`, {
      headers: { apikey: config.apiKey },
    });

    if (!resposta.ok) {
      this.logger.warn(`Instância ${config.instance} respondeu ${resposta.status}.`);
      return {};
    }

    return (await resposta.json()) as { state?: string };
  }
}
