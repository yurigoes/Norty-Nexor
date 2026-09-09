import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Áudios que o WhatsApp manda. Vídeo e documento não passam por aqui. */
const TIPOS_DE_AUDIO = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'];

/**
 * Transcrição de áudio.
 *
 * O cliente manda um áudio de quarenta segundos e o agente precisa
 * ouvi-lo para saber do que se trata — não dá para buscar por texto, não
 * entra na regra de entrada, e não dá para ler numa reunião. Transcrever
 * resolve os três.
 *
 * O modelo roda no Ollama do CT 102, na rede da casa: o áudio do cliente
 * não sai para serviço de terceiro (`docs/11-infra.md`).
 */
@Injectable()
export class TranscricaoService {
  private readonly logger = new Logger(TranscricaoService.name);

  constructor(private readonly config: ConfigService) {}

  ehAudio(contentType: string | undefined): boolean {
    if (!contentType) return false;
    const base = contentType.split(';')[0]!.trim().toLowerCase();
    return TIPOS_DE_AUDIO.includes(base);
  }

  get habilitada(): boolean {
    return Boolean(this.config.get<string>('OLLAMA_BASE_URL'));
  }

  /**
   * Transcreve, ou devolve `null`.
   *
   * **Nunca lança e nunca bloqueia o chamado.** Ollama fora do ar,
   * modelo não baixado, áudio corrompido: em todos os casos a mensagem
   * vira chamado com o áudio anexado, exatamente como antes de existir
   * transcrição. Degradar em silêncio aqui é o comportamento certo — o
   * cliente já mandou o áudio e está esperando atendimento, não uma
   * mensagem de erro sobre um recurso interno.
   */
  async transcrever(audio: Buffer, contentType: string): Promise<string | null> {
    const base = this.config.get<string>('OLLAMA_BASE_URL');
    if (!base) return null;

    const modelo = this.config.get<string>('OLLAMA_MODELO_AUDIO') ?? 'whisper';
    const limite = Number(this.config.get<string>('TRANSCRICAO_LIMITE_MB') ?? 25) * 1024 * 1024;

    if (audio.length > limite) {
      this.logger.warn(`Áudio de ${audio.length} bytes acima do limite; não transcrevi.`);
      return null;
    }

    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), 120_000);

    try {
      const resposta = await fetch(`${base.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        signal: controle.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          prompt:
            'Transcreva este áudio em português do Brasil. Devolva apenas a transcrição, ' +
            'sem comentários, sem aspas e sem preâmbulo.',
          images: [audio.toString('base64')],
          stream: false,
          options: { temperature: 0 },
        }),
      });

      if (!resposta.ok) {
        this.logger.warn(`Ollama respondeu ${resposta.status}; sigo sem transcrição.`);
        return null;
      }

      const corpo = (await resposta.json()) as { response?: string };
      const texto = corpo.response?.trim();

      if (!texto) return null;

      // Um limite generoso: áudio de dez minutos dá umas 1500 palavras.
      // Sem teto, um modelo em laço encheria a linha do tempo.
      return texto.slice(0, 20_000);
    } catch (erro) {
      const motivo =
        (erro as Error).name === 'AbortError'
          ? 'passou de dois minutos'
          : (erro as Error).message;

      this.logger.warn(`Transcrição falhou (${motivo}); o áudio segue como anexo.`);
      return null;
    } finally {
      clearTimeout(alarme);
    }
  }

  /**
   * O corpo do evento quando há transcrição.
   *
   * O texto entra marcado como transcrição, e não como se a pessoa o
   * tivesse digitado: quem lê precisa saber que aquilo saiu de um
   * modelo e pode estar errado — nome próprio e número são justamente o
   * que a transcrição erra.
   */
  static comMarca(transcricao: string, legenda?: string | null): string {
    const partes = [`🎙️ Transcrição do áudio:\n\n${transcricao}`];
    if (legenda?.trim()) partes.push(`\n\nLegenda: ${legenda.trim()}`);
    return partes.join('');
  }
}
