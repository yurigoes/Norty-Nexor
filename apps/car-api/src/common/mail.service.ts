import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { loadConfig } from '../config/env';

export type MailResult = { status: 'SENT' } | { status: 'NOT_CONFIGURED' } | { status: 'FAILED'; error: string };

/**
 * Envio de e-mail por SMTP. Sem SMTP configurado, o envio não é
 * simulado: devolve NOT_CONFIGURED e quem chamou registra a pendência.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config = loadConfig().smtp;
  private transporter: Transporter | null = null;

  get configured(): boolean {
    return Boolean(this.config.host && this.config.from);
  }

  private transport(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.port === 465,
        auth: this.config.user ? { user: this.config.user, pass: this.config.pass } : undefined,
      });
    }
    return this.transporter;
  }

  async send(to: string, subject: string, text: string): Promise<MailResult> {
    if (!this.configured) return { status: 'NOT_CONFIGURED' };
    try {
      await this.transport().sendMail({ from: this.config.from, to, subject, text });
      return { status: 'SENT' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Falha ao enviar e-mail: ${message}`);
      return { status: 'FAILED', error: message.slice(0, 300) };
    }
  }

  /** Testa a conexão SMTP de verdade (usado pelo painel de integrações). */
  async verify(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) return { ok: false, message: 'SMTP não configurado (SMTP_HOST e SMTP_FROM).' };
    try {
      await this.transport().verify();
      return { ok: true, message: 'Conexão SMTP verificada.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
