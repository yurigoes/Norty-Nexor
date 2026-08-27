/* =========================================================
   LICITA+ API — Diagnóstico de SMTP
   ---------------------------------------------------------
   "O e-mail não chegou" tem meia dúzia de causas que se parecem
   por fora: host vazio, credencial faltando, senha errada, porta
   bloqueada pelo firewall, TLS na porta errada. Ler o log da API
   distingue algumas; este comando distingue todas, e diz o que
   fazer para cada uma.

   Roda dentro do container, onde as variáveis e a rota de rede
   são as mesmas que o envio de verdade usa — testar do host
   provaria outra coisa.

     docker compose exec -T licita-api node dist/tarefas/smtp.js
     docker compose exec -T licita-api node dist/tarefas/smtp.js voce@exemplo.com
   ========================================================= */

import { createTransport } from 'nodemailer';
import { carregarConfig } from '../config/env';

const config = carregarConfig();

const verde = (t: string) => `\x1b[32m${t}\x1b[0m`;
const vermelho = (t: string) => `\x1b[31m${t}\x1b[0m`;
const amarelo = (t: string) => `\x1b[33m${t}\x1b[0m`;

/** Traduz o erro do nodemailer no que precisa ser feito. */
function explicar(erro: unknown): string[] {
  const bruto = erro instanceof Error ? erro.message : String(erro);
  const codigo = (erro as { code?: string })?.code ?? '';

  if (/EAUTH|535|534|530/.test(bruto + codigo)) {
    return [
      'O servidor recusou as credenciais.',
      'Confira SMTP_USER e SMTP_PASS no .env do host.',
      'Se SMTP_USER estiver vazio, a API tenta enviar sem autenticar —',
      'e quase nenhum servidor aceita isso.',
    ];
  }

  if (/ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(bruto + codigo)) {
    return [
      `Não foi possível abrir conexão com ${config.smtp.host}:${config.smtp.porta}.`,
      'Ou a porta está fechada para este container, ou o host está errado.',
      'Teste de dentro do container:',
      `    nc -zv ${config.smtp.host} ${config.smtp.porta}`,
    ];
  }

  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(bruto + codigo)) {
    return [
      `O nome ${config.smtp.host} não resolveu.`,
      'Confira SMTP_HOST, e se o container tem DNS funcionando.',
    ];
  }

  if (/wrong version number|SSL routines|ERR_SSL/.test(bruto)) {
    return [
      'Descompasso de TLS: provavelmente o modo não bate com a porta.',
      'A 465 é TLS implícito; a 587 é STARTTLS.',
      'A API deduz isso pela porta — só force SMTP_SECURE se o',
      'servidor fugir da convenção.',
    ];
  }

  if (/certificate|self.signed|unable to verify/i.test(bruto)) {
    return [
      'O certificado do servidor não foi aceito.',
      'Se for um certificado próprio, ele precisa entrar na',
      'confiança do container por NODE_EXTRA_CA_CERTS — não',
      'desligue a verificação de TLS.',
    ];
  }

  return ['Erro não catalogado. A mensagem acima é o que o servidor devolveu.'];
}

async function principal(): Promise<void> {
  const destino = process.argv[2];

  console.log('');
  console.log(`  host      ${config.smtp.host || vermelho('(vazio)')}`);
  console.log(`  porta     ${config.smtp.porta}`);
  console.log(`  modo      ${config.smtp.seguro ? 'TLS implícito' : 'STARTTLS'}`);
  console.log(`  usuário   ${config.smtp.usuario || vermelho('(vazio)')}`);
  console.log(`  senha     ${config.smtp.senha ? verde('definida') : vermelho('(vazia)')}`);
  console.log(`  remetente ${config.smtp.remetente}`);
  console.log('');

  if (!config.smtp.ativo) {
    console.log(vermelho('  SMTP_HOST está vazio — a API nem tenta enviar.'));
    console.log(amarelo('  Preencha o bloco de e-mail no .env do host e recrie o container:'));
    console.log('      docker compose up -d licita-api');
    process.exitCode = 1;
    return;
  }

  if (!config.smtp.usuario || !config.smtp.senha) {
    // Não é um erro fatal aqui: alguns relays internos aceitam sem
    // autenticação. Mas é de longe a causa mais provável, então
    // avisa antes de tentar.
    console.log(amarelo('  SMTP_USER ou SMTP_PASS vazios — a tentativa será sem autenticar.'));
    console.log('');
  }

  const transporte = createTransport({
    host: config.smtp.host,
    port: config.smtp.porta,
    secure: config.smtp.seguro,
    auth: config.smtp.usuario ? { user: config.smtp.usuario, pass: config.smtp.senha } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });

  try {
    await transporte.verify();
    console.log(verde('  ✔ Conexão e autenticação aceitas pelo servidor.'));
  } catch (erro) {
    console.log(vermelho('  ✖ O servidor recusou a conexão ou a autenticação.'));
    console.log('');
    console.log(`  ${erro instanceof Error ? erro.message : String(erro)}`);
    console.log('');
    explicar(erro).forEach((linha) => console.log(amarelo(`  ${linha}`)));
    process.exitCode = 1;
    return;
  }

  if (!destino) {
    console.log('');
    console.log(amarelo('  Para enviar uma mensagem de teste de verdade:'));
    console.log('      node dist/tarefas/smtp.js voce@exemplo.com');
    return;
  }

  try {
    const info = await transporte.sendMail({
      from: config.smtp.remetente,
      to: destino,
      subject: 'Teste de SMTP — LICITA+',
      text: 'Se esta mensagem chegou, o envio do LICITA+ está funcionando.',
    });
    console.log(verde(`  ✔ Mensagem aceita para ${destino}.`));
    console.log(`    id do servidor: ${info.messageId}`);
    console.log('');
    console.log(amarelo('  "Aceita" é o servidor confirmando o recebimento, não a entrega.'));
    console.log(amarelo('  Se não chegar, confira a caixa de spam e, depois, SPF/DKIM do domínio.'));
  } catch (erro) {
    console.log(vermelho(`  ✖ O servidor recusou a mensagem para ${destino}.`));
    console.log('');
    console.log(`  ${erro instanceof Error ? erro.message : String(erro)}`);
    console.log('');
    explicar(erro).forEach((linha) => console.log(amarelo(`  ${linha}`)));
    process.exitCode = 1;
  }
}

principal().catch((erro) => {
  console.error(vermelho(erro instanceof Error ? erro.message : String(erro)));
  process.exitCode = 1;
});
