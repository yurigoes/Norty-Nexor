/* =========================================================
   LICITA+ API — Envio de e-mail
   ---------------------------------------------------------
   SMTP via nodemailer. Sem SMTP configurado o envio não falha:
   registra no log e segue. É o que permite subir a API antes de
   o servidor de e-mail estar pronto sem travar o cadastro — em
   desenvolvimento o link aparece no console.

   Falha de envio nunca derruba a operação que a originou. Se o
   SMTP cair, o cadastro do usuário continua valendo e o e-mail
   pode ser reenviado; perder a conta porque o servidor de
   e-mail piscou seria pior.
   ========================================================= */

import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { carregarConfig } from '../../config/env';

const config = carregarConfig();

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporte: Transporter | null = null;

  private obterTransporte(): Transporter | null {
    if (!config.smtp.ativo) return null;
    if (this.transporte) return this.transporte;

    this.transporte = createTransport({
      host: config.smtp.host,
      port: config.smtp.porta,
      secure: config.smtp.seguro,
      auth: config.smtp.usuario ? { user: config.smtp.usuario, pass: config.smtp.senha } : undefined,
    });

    return this.transporte;
  }

  /**
   * Devolve `true` quando o servidor aceitou a mensagem. Falha de
   * envio continua não derrubando a operação que a originou — mas
   * quem chamou passa a saber, e pode dizer a verdade na tela em
   * vez de prometer um e-mail que não saiu.
   */
  private async enviar(para: string, assunto: string, html: string, texto: string): Promise<boolean> {
    const transporte = this.obterTransporte();

    if (!transporte) {
      this.logger.warn(`SMTP desligado — e-mail para ${para} não enviado: "${assunto}"`);
      if (!config.producao) this.logger.debug(`Conteúdo:\n${texto}`);
      return false;
    }

    try {
      await transporte.sendMail({ from: config.smtp.remetente, to: para, subject: assunto, html, text: texto });
      this.logger.log(`E-mail enviado para ${para}: "${assunto}"`);
      return true;
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar para ${para}: ${erro instanceof Error ? erro.message : String(erro)}. ` +
          'Diagnostique com: node dist/tarefas/smtp.js',
      );
      return false;
    }
  }

  async confirmacaoDeConta(para: string, nome: string, token: string): Promise<boolean> {
    const link = `${config.urlApp}/#/confirmar?token=${encodeURIComponent(token)}`;

    return this.enviar(
      para,
      'Confirme seu e-mail — LICITA+',
      molde({
        titulo: `Bem-vindo ao LICITA+, ${primeiroNome(nome)}`,
        corpo: `
          <p>Falta um passo para o seu radar começar a trabalhar: confirme que este
          endereço é seu.</p>
          <p>O link vale por <strong>24 horas</strong>.</p>`,
        botao: { texto: 'Confirmar meu e-mail', link },
        rodape: 'Se você não criou esta conta, ignore esta mensagem — nada acontece sem a confirmação.',
      }),
      `Bem-vindo ao LICITA+, ${primeiroNome(nome)}.\n\nConfirme seu e-mail: ${link}\n\nO link vale por 24 horas.`,
    );
  }

  async redefinicaoDeSenha(para: string, nome: string, token: string): Promise<boolean> {
    const link = `${config.urlApp}/#/redefinir?token=${encodeURIComponent(token)}`;

    return this.enviar(
      para,
      'Redefinir sua senha — LICITA+',
      molde({
        titulo: 'Redefinir sua senha',
        corpo: `
          <p>Recebemos um pedido para redefinir a senha da sua conta no LICITA+.</p>
          <p>O link vale por <strong>1 hora</strong> e só pode ser usado uma vez.</p>`,
        botao: { texto: 'Criar nova senha', link },
        rodape:
          'Se não foi você, ignore esta mensagem — sua senha continua a mesma. ' +
          'Ninguém consegue trocá-la sem abrir este link.',
      }),
      `Redefinir sua senha no LICITA+: ${link}\n\nO link vale por 1 hora e só pode ser usado uma vez.\nSe não foi você, ignore — a senha continua a mesma.`,
    );
  }
}

const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? '';

/**
 * Molde HTML com estilo embutido. Cliente de e-mail não carrega
 * folha externa nem entende variável CSS — cada cor vai literal,
 * e é a única parte do produto onde isso é correto.
 */
function molde({
  titulo, corpo, botao, rodape,
}: {
  titulo: string;
  corpo: string;
  botao: { texto: string; link: string };
  rodape: string;
}): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden">

        <tr><td style="background:linear-gradient(135deg,#071E3D 0%,#005CA9 60%,#008C45 100%);padding:24px 28px">
          <span style="color:#FFFFFF;font-size:20px;font-weight:800;letter-spacing:-.5px">LICITA<span style="color:#FFCC00">+</span></span>
        </td></tr>

        <tr><td style="padding:28px">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#10233F">${titulo}</h1>
          <div style="font-size:15px;line-height:1.6;color:#475569">${corpo}</div>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0">
            <tr><td style="background:#005CA9;border-radius:10px">
              <a href="${botao.link}" style="display:inline-block;padding:13px 24px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none">${botao.texto}</a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8">
            Se o botão não funcionar, copie este endereço no navegador:<br>
            <span style="color:#64748B;word-break:break-all">${botao.link}</span>
          </p>
        </td></tr>

        <tr><td style="padding:18px 28px;background:#F5F7FA;border-top:1px solid #E2E8F0">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#64748B">${rodape}</p>
        </td></tr>

      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#94A3B8">LICITA+ · Inteligência para oportunidades públicas</p>
    </td></tr>
  </table>
</body></html>`;
}
