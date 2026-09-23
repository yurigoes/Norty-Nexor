import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FormularioView, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * A pessoa que tem cadastro e não entra.
 *
 * Ela existe porque assina o termo de um equipamento, aparece no
 * inventário e é quem se procura quando o notebook some. Não precisa da
 * central de chamados, e obrigá-la a ter senha criaria credencial para
 * quem não pediu — conta a mais para vazar.
 *
 * O que se prova aqui são as três bordas, porque são elas que separam
 * "cadastro sem acesso" de "conta com senha em branco":
 *
 * 1. **Não entra**, e a recusa é a mesma de senha errada — quem mede a
 *    resposta não descobre quais contas não têm senha.
 * 2. **Nenhuma senha provisória é gerada.** Não há o que mostrar, e
 *    portanto não há o que esquecer num chat.
 * 3. **A automação não dá acesso.** Quem decide que alguém passa a
 *    entrar é gente, não um chamado.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;

/** O modelo de chamado que dispara a troca de senha. */
let modelo: FormularioView;

type PessoaCriada = {
  id: string;
  email: string | null;
  name: string;
  senhaProvisoria: string | null;
};

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);

  const r = await admin.post<FormularioView>('/forms', {
    name: 'Trocar minha senha',
    schema: { fields: [] },
    isModel: true,
    acaoAutomatica: 'RESET_DE_SENHA',
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  modelo = r.corpo;
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // A escada de bloqueio é por IP, e a suíte inteira compartilha o dela:
  // sem limpar, a tentativa recusada de um teste barra o login do
  // seguinte e a falha aparece longe da causa.
  await prisma.loginThrottle.deleteMany({});
  await prisma.outboundMessage.deleteMany({});
});

let sequencia = 0;

/** Cria uma pessoa pela API, com ou sem acesso. */
async function criarPessoa(semAcesso: boolean): Promise<PessoaCriada> {
  sequencia += 1;
  const r = await admin.post<PessoaCriada>('/users', {
    email: `uso${sequencia}@teste.dev`,
    name: `Pessoa de uso ${sequencia}`,
    role: 'SOLICITANTE',
    ...(semAcesso ? { semAcesso: true } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('cadastro de uso', () => {
  it('nasce sem senha e sem senha provisória para ninguém guardar', async () => {
    const pessoa = await criarPessoa(true);

    assert.equal(
      pessoa.senhaProvisoria,
      null,
      'gerar uma senha que ninguém vai usar é credencial criada à toa',
    );

    const salvo = await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } });
    assert.equal(salvo.passwordHash, null, 'nulo, e não string vazia');
    assert.equal(
      salvo.mustChangePassword,
      false,
      'não há primeiro acesso para exigir troca de senha',
    );
  });

  it('não entra, e a recusa é a mesma de senha errada', async () => {
    const pessoa = await criarPessoa(true);

    const tentativa = await new Cliente(api.url).entrar(pessoa.email!, 'qualquer-senha');
    assert.equal(tentativa.status, 401);
    assert.equal(
      (tentativa.corpo as { title?: string }).title,
      'Usuário ou senha inválidos.',
      'mensagem diferente entregaria a lista de quem não tem senha',
    );
  });

  it('a recusa não é mais rápida que uma senha errada', async () => {
    const semSenha = await criarPessoa(true);
    const comSenha = await criarPessoa(false);

    /** Mediana de três, para uma pausa do coletor não virar o resultado. */
    async function quantoDemora(email: string): Promise<number> {
      const amostras: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        await prisma.loginThrottle.deleteMany({});
        const inicio = performance.now();
        const r = await new Cliente(api.url).entrar(email, 'senha-errada-mesmo');
        assert.equal(r.status, 401);
        amostras.push(performance.now() - inicio);
      }
      return amostras.sort((a, b) => a - b)[1]!;
    }

    const errada = await quantoDemora(comSenha.email!);
    const inexistente = await quantoDemora(semSenha.email!);

    // O piso é folgado de propósito: o que se quer pegar é a diferença
    // de ordem de grandeza. Sem o Argon2 do fantasma a conta sem senha
    // responde em menos de um milissegundo, contra dezenas da senha
    // errada — e é essa diferença que diz a quem medisse quais contas
    // não têm senha.
    assert.ok(
      inexistente > errada * 0.4,
      `cadastro de uso respondeu em ${inexistente.toFixed(1)}ms contra ` +
        `${errada.toFixed(1)}ms da senha errada: o relógio está entregando quem não tem senha`,
    );
  });

  it('a pessoa comum continua nascendo com senha provisória', async () => {
    const pessoa = await criarPessoa(false);

    assert.ok(pessoa.senhaProvisoria, 'sem `semAcesso` nada muda');

    const entrou = await new Cliente(api.url).entrar(pessoa.email!, pessoa.senhaProvisoria!);
    assert.equal(entrou.status, 200, 'a senha provisória tem de abrir a conta');
  });

  it('a automação de senha recusa dar acesso a quem não tem', async () => {
    const pessoa = await criarPessoa(true);

    // Aberto por quem administra, em nome dela: o canal é WEB, que é o
    // que a ação automática exige. Sem a cerca, o link sairia daqui e
    // daria acesso a quem a organização escolheu não dar.
    const chamado = await admin.post<TicketDetail>('/tickets', {
      subject: 'Esqueci minha senha',
      description: 'Não consigo entrar.',
      formId: modelo.id,
      requester: { kind: 'USER', id: pessoa.id },
    });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));

    const fila = await prisma.outboundMessage.findMany({ select: { body: true } });
    assert.ok(
      !fila.some((m) => m.body.includes('/definir-senha/')),
      `nenhum link deveria ter saído: ${JSON.stringify(fila)}`,
    );

    const notas = await prisma.ticketEvent.findMany({
      where: { ticketId: chamado.corpo.id, visibility: 'INTERNA' },
      select: { body: true },
    });
    assert.ok(
      notas.some((n) => n.body?.includes('cadastro de uso')),
      `a recusa precisa dizer por quê: ${JSON.stringify(notas)}`,
    );

    // E o chamado fica de pé, para uma pessoa decidir.
    const atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.corpo.id } });
    assert.notEqual(atual.status, 'SOLUCIONADO');
  });
});
