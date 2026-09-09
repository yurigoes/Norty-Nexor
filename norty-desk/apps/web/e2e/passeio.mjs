/**
 * Passeio de navegador.
 *
 * Sobe o Chromium de verdade e percorre o caminho que o agente faz num
 * dia: entrar, ver a fila, abrir chamado, responder, escrever nota
 * interna, voltar. No fim entra como solicitante e confere que a nota
 * interna **não** chegou ao portal.
 *
 * A suíte da API prova a regra no servidor; este passeio prova que a
 * tela não a desfaz — são coisas diferentes, e a segunda é a que o
 * usuário vê.
 *
 * Precisa da API em :3061 e do aplicativo em :5174.
 *
 *     npm run dev:api    # noutro terminal
 *     npm run dev:web    # noutro terminal
 *     npm run test:navegador -w @norty-desk/web
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const CAPTURAS = process.env.CAPTURAS ?? '/tmp/norty-desk-capturas';
const BASE = process.env.WEB_URL ?? 'http://127.0.0.1:5174';
const SENHA = process.env.SENHA_DEMO ?? '123456';

await mkdir(CAPTURAS, { recursive: true });

const navegador = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
});
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });

const problemas = [];
pagina.on('pageerror', (e) => problemas.push(`erro de página: ${e}`));
pagina.on('console', (m) => {
  const texto = m.text();
  // 401 na subida é rotina: é a tentativa de recuperar a sessão pelo
  // cookie antes de mostrar o login. Fonte externa bloqueada também não
  // é defeito do aplicativo.
  const esperado =
    texto.includes('401') || texto.includes('ERR_CONNECTION_RESET') || texto.includes('404');
  if (m.type() === 'error' && !esperado) problemas.push(`console: ${texto}`);
});

let passos = 0;
const passo = async (nome, acao) => {
  await acao();
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `${CAPTURAS}/${nome}.png` });
  passos += 1;
  console.log(`  ✓ ${nome}`);
};

const entrar = async (email) => {
  await pagina.goto(BASE, { waitUntil: 'networkidle' });
  await pagina.fill('#email', email);
  await pagina.fill('#senha', SENHA);
  await pagina.click('button[type=submit]');
};

const SEGREDO = `nota interna ${Date.now()}`;

try {
  await passo('01-login', () => pagina.goto(BASE, { waitUntil: 'networkidle' }));

  await passo('02-fila', async () => {
    await entrar('agente@desk.test');
    await pagina.waitForSelector('.tabela, .vazio', { timeout: 15000 });
  });

  await passo('03-novo-chamado', async () => {
    await pagina.click('text=Novo chamado');
    await pagina.waitForSelector('#assunto');
    await pagina.fill('#assunto', 'Notebook não liga após atualização');
    await pagina.fill('#descricao', 'Tela preta, luz do teclado acesa.');
    await pagina.selectOption('#urgencia', '5');
    await pagina.selectOption('#impacto', '4');
  });

  await passo('04-chamado-aberto', async () => {
    await pagina.click('button[type=submit]:has-text("Abrir chamado")');
    await pagina.waitForSelector('.conversa', { timeout: 15000 });
  });

  await passo('05-resposta-publica', async () => {
    await pagina.fill('#corpo-resposta', 'Recebemos seu chamado. Vamos verificar a fonte.');
    await pagina.click('button:has-text("Enviar resposta")');
    await pagina.waitForSelector('.conversa-evento:not(.-sistema) >> nth=1', { timeout: 10000 });
  });

  await passo('06-nota-interna', async () => {
    await pagina.selectOption('#visibilidade', 'INTERNA');
    await pagina.fill('#corpo-resposta', SEGREDO);
    await pagina.click('button:has-text("Salvar nota")');
    await pagina.waitForSelector('.conversa-evento.-interna', { timeout: 10000 });
  });

  await passo('07-fila-com-chamado', async () => {
    await pagina.click('text=Voltar para a fila');
    await pagina.waitForSelector('.tabela');
  });

  await pagina.context().clearCookies();
  await passo('08-portal-solicitante', async () => {
    await entrar('solicitante@desk.test');
    await pagina.waitForSelector('.cabecalho-secao, .vazio', { timeout: 15000 });
  });

  const vazou = (await pagina.content()).includes(SEGREDO);
  if (vazou) problemas.push('A NOTA INTERNA APARECEU NO PORTAL DO SOLICITANTE.');

  console.log(`\n${passos} passos concluídos.`);
  console.log('Capturas em', CAPTURAS);
  console.log('Nota interna vazou para o portal?', vazou ? 'SIM' : 'não');
} finally {
  await navegador.close();
}

if (problemas.length) {
  console.error('\nProblemas:');
  for (const p of problemas) console.error(' -', p);
  process.exit(1);
}
