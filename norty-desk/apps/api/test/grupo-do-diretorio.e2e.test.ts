import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { GruposDoDiretorioService } from '../src/modules/diretorio/grupos.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/** O que `GET /auth-sources/:id/grupos` devolve. */
type MapaView = {
  id: string;
  group: string;
  role: string | null;
  isTeamManager: boolean;
  position: number;
  team: { id: string; name: string } | null;
};

/**
 * Grupo do diretório virando time e papel.
 *
 * Conceder é a parte fácil. O que decide se isto presta é **revogar**:
 * tirar alguém do grupo no AD tem de tirar do time e devolver o papel,
 * senão o mapa é uma catraca que só gira para um lado e quem mudou de
 * área continua vendo a fila da área antiga.
 *
 * E revogar tem o risco oposto: apagar o que ninguém mandou apagar. Quem
 * atrelou alguém a um time pela tela não quer que a varredura do AD
 * desfaça aquilo.
 *
 * A saída é a do inventário: **o diretório só mexe no que é dele.** É o
 * que estes testes cercam, dos dois lados.
 *
 * Aqui o serviço é exercitado direto, com a lista de grupos que o LDAP
 * teria devolvido — subir um Active Directory na suíte seria testar o
 * `ldapts`, e a leitura em si já tem teste de unidade em `ldap.test.ts`.
 */

let f: Fixtura;
let api: Api;
let admin: Cliente;
let grupos: GruposDoDiretorioService;
let fonteId = '';

/** A fonte que os mapas pendurados pertencem. */
async function fonte() {
  return prisma.authSource.findUniqueOrThrow({ where: { id: fonteId } });
}

before(async () => {
  await limparBanco();
  f = await semear();

  grupos = new GruposDoDiretorioService(prisma as unknown as PrismaService);

  const criada = await prisma.authSource.create({
    data: {
      organizationId: f.organizacao.id,
      name: 'AD da matriz',
      host: 'ad.teste.dev',
      baseDn: 'DC=teste,DC=dev',
      defaultRole: 'SOLICITANTE',
    },
    select: { id: true },
  });

  fonteId = criada.id;

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();
  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

/** Um mapa de grupo nesta fonte. */
async function mapear(dados: {
  group: string;
  teamId?: string | null;
  role?: 'SOLICITANTE' | 'AGENTE' | 'SUPERVISOR' | null;
  isTeamManager?: boolean;
  position?: number;
  isActive?: boolean;
}) {
  return prisma.directoryGroupMap.create({
    data: {
      organizationId: f.organizacao.id,
      authSourceId: fonteId,
      group: dados.group,
      teamId: dados.teamId ?? null,
      role: dados.role ?? null,
      isTeamManager: dados.isTeamManager ?? false,
      position: dados.position ?? 0,
      isActive: dados.isActive ?? true,
    },
    select: { id: true },
  });
}

/** Em quais times a pessoa está, e por obra de quem. */
async function timesDe(userId: string) {
  const linhas = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true, isManager: true, managedByDirectory: true },
  });

  return linhas.sort((a, b) => a.teamId.localeCompare(b.teamId));
}

async function vinculoDe(userId: string) {
  return prisma.membership.findUniqueOrThrow({
    where: { userId_organizationId: { userId, organizationId: f.organizacao.id } },
    select: { role: true, roleFromDirectory: true },
  });
}

/** Uma pessoa limpa, sem time e como solicitante. */
async function alguem(nome: string) {
  const usuario = await prisma.user.create({
    data: {
      name: nome,
      email: `${nome.toLowerCase().replace(/\W/g, '')}@teste.dev`,
      authSourceId: fonteId,
      memberships: { create: { organizationId: f.organizacao.id, role: 'SOLICITANTE' } },
    },
    select: { id: true },
  });

  return usuario.id;
}

const DN_SUPORTE = 'CN=TI-Suporte,OU=Grupos,DC=teste,DC=dev';
const DN_LIDERES = 'CN=TI-Lideres,OU=Grupos,DC=teste,DC=dev';

// ---------------------------------------------------------------------

describe('conceder', () => {
  it('põe no time e dá o papel do grupo que casou', async () => {
    await mapear({ group: 'TI-Suporte', teamId: f.time.id, role: 'AGENTE' });

    const quem = await alguem('Concede');
    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    assert.ok(r);
    assert.deepEqual(r.timesEntrou, [f.time.id]);
    assert.equal(r.papel, 'AGENTE');

    // E marcado como do diretório nos dois lugares — é o que torna a
    // revogação possível sem apagar o que é de alguém.
    assert.deepEqual(await timesDe(quem), [
      { teamId: f.time.id, isManager: false, managedByDirectory: true },
    ]);
    assert.deepEqual(await vinculoDe(quem), { role: 'AGENTE', roleFromDirectory: true });
  });

  it('casa o mapa escrito pelo nome com o DN que o AD devolve', async () => {
    // O mapa diz "TI-Suporte"; o `memberOf` diz o DN inteiro. Se não
    // casassem, o mapa nunca valeria e ninguém saberia por quê.
    const quem = await alguem('PeloNome');
    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    assert.equal(r?.timesEntrou.length, 1);
  });

  it('não concede nada quando nenhum grupo casa', async () => {
    const quem = await alguem('SemGrupo');
    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, [
      'CN=Financeiro,OU=Grupos,DC=teste,DC=dev',
    ]);

    assert.deepEqual(r?.timesEntrou, []);
    assert.deepEqual(await timesDe(quem), []);
    assert.equal((await vinculoDe(quem)).role, 'SOLICITANTE');
  });

  it('entra em todos os times que casam, e basta um mapa para ser gerente', async () => {
    await mapear({ group: 'TI-Lideres', teamId: f.time.id, isTeamManager: true, position: 1 });

    const quem = await alguem('Lider');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE, DN_LIDERES]);

    assert.deepEqual(await timesDe(quem), [
      { teamId: f.time.id, isManager: true, managedByDirectory: true },
    ]);
  });

  it('ignora mapa desligado', async () => {
    const desligado = await mapear({
      group: 'TI-Arquivado',
      teamId: f.outroTime.id,
      isActive: false,
      position: 9,
    });

    const quem = await alguem('Desligado');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [
      'CN=TI-Arquivado,OU=Grupos,DC=teste,DC=dev',
    ]);

    assert.deepEqual(await timesDe(quem), []);

    await prisma.directoryGroupMap.delete({ where: { id: desligado.id } });
  });
});

describe('o papel, quando mais de um grupo dá papel', () => {
  it('vence o primeiro pela ordem, não o último nem o "mais forte"', async () => {
    const primeiro = await mapear({ group: 'TI-Chefia', role: 'SUPERVISOR', position: 0 });
    const segundo = await mapear({ group: 'TI-Campo', role: 'AGENTE', position: 5 });

    const quem = await alguem('DoisPapeis');
    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, [
      'CN=TI-Campo,OU=Grupos,DC=teste,DC=dev',
      'CN=TI-Chefia,OU=Grupos,DC=teste,DC=dev',
    ]);

    // A ordem do mapa decide, e não a ordem em que o AD listou os grupos.
    assert.equal(r?.papel, 'SUPERVISOR');

    // Invertendo a posição, inverte o resultado — é a prova de que quem
    // manda é a ordem configurada.
    await prisma.directoryGroupMap.update({ where: { id: primeiro.id }, data: { position: 9 } });

    const outro = await alguem('DoisPapeis2');
    const r2 = await grupos.aplicar(await fonte(), outro, f.organizacao.id, [
      'CN=TI-Campo,OU=Grupos,DC=teste,DC=dev',
      'CN=TI-Chefia,OU=Grupos,DC=teste,DC=dev',
    ]);

    assert.equal(r2?.papel, 'AGENTE');

    await prisma.directoryGroupMap.delete({ where: { id: primeiro.id } });
    await prisma.directoryGroupMap.delete({ where: { id: segundo.id } });
  });
});

describe('revogar', () => {
  it('tira do time quando a pessoa sai do grupo', async () => {
    const quem = await alguem('Saiu');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);
    assert.equal((await timesDe(quem)).length, 1);

    // Mesma pessoa, próximo login, sem o grupo.
    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, []);

    assert.deepEqual(r?.timesSaiu, [f.time.id]);
    assert.deepEqual(await timesDe(quem), []);
  });

  it('devolve o papel ao padrão da fonte', async () => {
    const quem = await alguem('Rebaixa');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);
    assert.equal((await vinculoDe(quem)).role, 'AGENTE');

    await grupos.aplicar(await fonte(), quem, f.organizacao.id, []);

    // `defaultRole` da fonte é SOLICITANTE. Sem isto, tirar do grupo no
    // AD não tiraria o acesso — que é metade do motivo do mapa existir.
    assert.equal((await vinculoDe(quem)).role, 'SOLICITANTE');
  });

  it('**não** tira do time quem foi atrelado à mão', async () => {
    const quem = await alguem('NaMao');

    // Alguém atrelou pela tela: sem a marca do diretório.
    await prisma.teamMember.create({ data: { teamId: f.outroTime.id, userId: quem } });

    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    const times = await timesDe(quem);
    assert.equal(times.length, 2, JSON.stringify(times));

    // E continua lá depois da revogação de tudo o que o diretório deu.
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, []);

    assert.deepEqual(await timesDe(quem), [
      { teamId: f.outroTime.id, isManager: false, managedByDirectory: false },
    ]);
  });

  it('**não** assume o vínculo que já existia à mão', async () => {
    // A pessoa já estava no time por decisão de alguém, e o mapa também
    // concede aquele time. Assumir a linha faria a próxima saída do grupo
    // apagar o que alguém pôs de propósito.
    const quem = await alguem('JaEstava');
    await prisma.teamMember.create({ data: { teamId: f.time.id, userId: quem } });

    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    assert.deepEqual(await timesDe(quem), [
      { teamId: f.time.id, isManager: false, managedByDirectory: false },
    ]);

    await grupos.aplicar(await fonte(), quem, f.organizacao.id, []);

    assert.equal((await timesDe(quem)).length, 1, 'o vínculo de alguém não é do diretório');
  });

  it('**não** promove a gerente do time quem entrou nele à mão', async () => {
    // O mapa concede gerência do time; a pessoa já estava no time por
    // decisão de alguém. Promovê-la seria o diretório mexendo numa linha
    // que não é dele — e gerente de time decide o que o time inteiro vê
    // (busca compartilhada), então a escalada é real.
    const quem = await alguem('GerenteNaMao');
    await prisma.teamMember.create({ data: { teamId: f.time.id, userId: quem } });

    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_LIDERES]);

    assert.deepEqual(await timesDe(quem), [
      { teamId: f.time.id, isManager: false, managedByDirectory: false },
    ]);
  });

  it('**não** desfaz o papel que um administrador deu à mão', async () => {
    const quem = await alguem('Promovida');

    // Promoção pela tela: `roleFromDirectory` continua falso.
    await prisma.membership.update({
      where: { userId_organizationId: { userId: quem, organizationId: f.organizacao.id } },
      data: { role: 'SUPERVISOR' },
    });

    await grupos.aplicar(await fonte(), quem, f.organizacao.id, []);

    assert.deepEqual(await vinculoDe(quem), { role: 'SUPERVISOR', roleFromDirectory: false });
  });

  it('não mexe em nada quando a fonte não tem mapa nenhum', async () => {
    // O estado de quem ainda não configurou. Tratá-lo como "nenhum grupo
    // casou" rebaixaria a central inteira ao papel padrão no primeiro
    // login depois da atualização.
    const outraFonte = await prisma.authSource.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'AD sem mapa',
        host: 'ad2.teste.dev',
        baseDn: 'DC=teste,DC=dev',
        defaultRole: 'SOLICITANTE',
      },
    });

    const quem = await alguem('SemMapa');
    await prisma.membership.update({
      where: { userId_organizationId: { userId: quem, organizationId: f.organizacao.id } },
      data: { role: 'AGENTE', roleFromDirectory: true },
    });
    await prisma.teamMember.create({
      data: { teamId: f.time.id, userId: quem, managedByDirectory: true },
    });

    const r = await grupos.aplicar(outraFonte, quem, f.organizacao.id, []);

    assert.equal(r, null, 'fonte sem mapa não decide nada');
    assert.equal((await vinculoDe(quem)).role, 'AGENTE');
    assert.equal((await timesDe(quem)).length, 1);
  });
});

describe('trocar de área', () => {
  it('sai de um time e entra no outro na mesma passada', async () => {
    const doOutro = await mapear({
      group: 'TI-Sustentacao',
      teamId: f.outroTime.id,
      role: 'AGENTE',
      position: 2,
    });

    const quem = await alguem('Trocou');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    assert.deepEqual(
      (await timesDe(quem)).map((t) => t.teamId),
      [f.time.id],
    );

    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, [
      'CN=TI-Sustentacao,OU=Grupos,DC=teste,DC=dev',
    ]);

    assert.deepEqual(r?.timesSaiu, [f.time.id]);
    assert.deepEqual(r?.timesEntrou, [f.outroTime.id]);
    assert.deepEqual(
      (await timesDe(quem)).map((t) => t.teamId),
      [f.outroTime.id],
    );

    await prisma.directoryGroupMap.delete({ where: { id: doOutro.id } });
  });

  it('é idempotente: entrar de novo no mesmo grupo não muda nada', async () => {
    const quem = await alguem('DeNovo');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    const r = await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);

    assert.deepEqual(r?.timesEntrou, []);
    assert.deepEqual(r?.timesSaiu, []);
  });
});

describe('a API do mapa', () => {
  it('recusa um grupo que daria administrador ou gestor', async () => {
    // A cerca que mais importa: quem administra o AD do cliente
    // escreveria um grupo com o nome que quisesse e se poria dentro
    // dele. Administrador e gestor do Desk continuam sendo decisão de
    // alguém daqui — a mesma regra do provisionamento automático.
    for (const role of ['ADMINISTRADOR', 'GESTOR']) {
      const recusado = await admin.post(`/auth-sources/${fonteId}/grupos`, {
        group: `TI-${role}`,
        role,
      });

      assert.equal(recusado.status, 400, `${role}: ${JSON.stringify(recusado.corpo)}`);
    }
  });

  it('aceita os papéis que o provisionamento já aceitava', async () => {
    const criado = await admin.post<MapaView[]>(`/auth-sources/${fonteId}/grupos`, {
      group: 'TI-Pela-API',
      role: 'SUPERVISOR',
      teamId: f.time.id,
    });

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    const novo = criado.corpo.find((m) => m.group === 'TI-Pela-API');
    assert.ok(novo);
    assert.equal(novo.role, 'SUPERVISOR');
    assert.equal(novo.team?.name, f.time.name);
  });

  it('recusa o mesmo grupo duas vezes na mesma fonte', async () => {
    // Dois mapas para o mesmo grupo seriam duas respostas para a mesma
    // pergunta, e a ordem decidiria em silêncio qual vale.
    const repetido = await admin.post(`/auth-sources/${fonteId}/grupos`, {
      group: 'TI-Pela-API',
      role: 'AGENTE',
    });

    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
    assert.match((repetido.corpo as { detail?: string }).detail ?? '', /já está mapeado/);
  });

  it('recusa time de outra organização', async () => {
    const alheio = await prisma.team.create({
      data: { organizationId: f.outra.id, name: 'Time da outra' },
      select: { id: true },
    });

    const recusado = await admin.post(`/auth-sources/${fonteId}/grupos`, {
      group: 'TI-Alheio',
      teamId: alheio.id,
    });

    assert.equal(recusado.status, 400, JSON.stringify(recusado.corpo));
  });

  it('não é de quem não configura autenticação', async () => {
    const agente = new Cliente(api.url);
    assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

    const lendo = await agente.get(`/auth-sources/${fonteId}/grupos`);
    assert.equal(lendo.status, 403, JSON.stringify(lendo.corpo));

    const escrevendo = await agente.post(`/auth-sources/${fonteId}/grupos`, { group: 'X' });
    assert.equal(escrevendo.status, 403);
  });

  it('apagar o mapa não desfaz o que ele concedeu — o próximo login desfaz', async () => {
    const quem = await alguem('ApagaMapa');
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);
    assert.equal((await timesDe(quem)).length, 1);

    const mapas = await admin.get<MapaView[]>(`/auth-sources/${fonteId}/grupos`);
    const doSuporte = mapas.corpo.find((m) => m.group === 'TI-Suporte');
    assert.ok(doSuporte);

    const apagado = await admin.del<MapaView[]>(
      `/auth-sources/${fonteId}/grupos/${doSuporte.id}`,
    );
    assert.equal(apagado.status, 200, JSON.stringify(apagado.corpo));

    // Ainda no time: varrer todo mundo na hora seria caro e irreversível,
    // e quem tirou o mapa pode ter tirado por engano.
    assert.equal((await timesDe(quem)).length, 1);

    // E sai no próximo login, porque o mapa não concede mais.
    await grupos.aplicar(await fonte(), quem, f.organizacao.id, [DN_SUPORTE]);
    assert.deepEqual(await timesDe(quem), []);
  });
});
