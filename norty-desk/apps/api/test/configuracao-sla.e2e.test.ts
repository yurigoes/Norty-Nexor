import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Configuração de SLA: acordos, calendários e motivos de pendência.
 *
 * Existiam no schema desde a Fase 1 e só se criavam por SQL — o que na
 * prática significa que ninguém os configurava. O que se prova aqui é
 * que a configuração errada é recusada **na hora de salvar**, e não
 * semanas depois num prazo calculado errado.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;
let agente: Cliente;

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

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------

describe('calendários', () => {
  it('fuso desconhecido é recusado ao salvar, não no cron', async () => {
    const r = await admin.post<{ detail?: string }>('/calendars', {
      name: 'Fuso inventado',
      timezone: 'America/Nao_Existe',
    });

    assert.equal(r.status, 400);
    assert.ok(
      String(r.corpo.detail ?? '').includes('Fuso horário desconhecido'),
      'sem esta checagem o erro apareceria semanas depois, num prazo errado',
    );
  });

  it('expediente que termina antes de começar é recusado', async () => {
    const r = await admin.post<{ detail?: string }>('/calendars', {
      name: 'Invertido',
      segments: [{ weekday: 1, startMinute: 1080, endMinute: 540 }],
    });

    assert.equal(r.status, 400);
    assert.ok(String(r.corpo.detail ?? '').includes('termina antes de começar'));
  });

  it('duas faixas sobrepostas no mesmo dia são recusadas', async () => {
    const r = await admin.post<{ detail?: string }>('/calendars', {
      name: 'Sobreposto',
      segments: [
        { weekday: 2, startMinute: 540, endMinute: 720 },
        { weekday: 2, startMinute: 660, endMinute: 1080 },
      ],
    });

    assert.equal(r.status, 400);
    assert.ok(
      String(r.corpo.detail ?? '').includes('sobrepostas'),
      'o prazo sairia menor do que o real e ninguém ligaria o defeito à configuração',
    );
  });

  it('duas faixas separadas no mesmo dia passam: é o horário de almoço', async () => {
    const r = await admin.post<{ id: string; segments: unknown[] }>('/calendars', {
      name: 'Comercial com almoço',
      timezone: 'America/Sao_Paulo',
      segments: [
        { weekday: 1, startMinute: 540, endMinute: 720 },
        { weekday: 1, startMinute: 780, endMinute: 1080 },
      ],
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.segments.length, 2);
  });

  it('editar substitui a semana inteira', async () => {
    const criado = await admin.post<{ id: string }>('/calendars', {
      name: 'Vai mudar',
      segments: [{ weekday: 1, startMinute: 540, endMinute: 1080 }],
    });

    const editado = await admin.patch<{ segments: { weekday: number }[] }>(
      `/calendars/${criado.corpo.id}`,
      {
        name: 'Vai mudar',
        segments: [
          { weekday: 3, startMinute: 600, endMinute: 900 },
          { weekday: 4, startMinute: 600, endMinute: 900 },
        ],
      },
    );

    assert.equal(editado.status, 200, JSON.stringify(editado.corpo));
    assert.equal(editado.corpo.segments.length, 2);
    assert.ok(
      !editado.corpo.segments.some((s) => s.weekday === 1),
      'editar item a item é como se acaba com faixa sobreposta na terça',
    );
  });

  it('feriado repetido na mesma data é conflito', async () => {
    const cal = await admin.post<{ id: string }>('/calendars', { name: 'Com feriado' });

    const um = await admin.post(`/calendars/${cal.corpo.id}/feriados`, {
      name: 'Independência',
      date: '2026-09-07',
      isRecurring: true,
    });
    assert.equal(um.status, 201, JSON.stringify(um.corpo));

    const dois = await admin.post(`/calendars/${cal.corpo.id}/feriados`, {
      name: 'Outro nome, mesma data',
      date: '2026-09-07',
    });
    assert.equal(dois.status, 409);
  });

  it('calendário de outra organização não existe para mim', async () => {
    const alheio = await prisma.calendar.create({
      data: { organizationId: f.outra.id, name: 'Da outra empresa' },
    });

    const r = await admin.patch(`/calendars/${alheio.id}`, { name: 'invadido' });
    assert.equal(r.status, 404);
  });
});

// ---------------------------------------------------------------------

describe('acordos', () => {
  it('cria, lista e desativa sem apagar o histórico', async () => {
    const cal = await admin.post<{ id: string }>('/calendars', { name: 'Para o acordo' });

    const criado = await admin.post<{ id: string }>('/agreements', {
      name: 'Resolução premium',
      kind: 'SLA',
      target: 'TTR',
      durationSeconds: 4 * 3600,
      calendarId: cal.corpo.id,
    });

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    const lista = await admin.get<{ id: string; durationSeconds: number; emUso: number }[]>(
      '/agreements',
    );
    const meu = lista.corpo.find((a) => a.id === criado.corpo.id)!;
    assert.equal(meu.durationSeconds, 4 * 3600);

    const apagado = await admin.del(`/agreements/${criado.corpo.id}`);
    assert.equal(apagado.status, 204);

    const ainda = await prisma.agreement.findUniqueOrThrow({ where: { id: criado.corpo.id } });
    assert.equal(
      ainda.isActive,
      false,
      'excluir apagaria a explicação de um número que continua no relatório',
    );
  });

  it('o mesmo nome, tipo e alvo não se repetem', async () => {
    const dados = {
      name: 'Primeiro atendimento',
      kind: 'SLA' as const,
      target: 'TTO' as const,
      durationSeconds: 3600,
    };

    // O nome já existe na fixtura.
    const r = await admin.post(`/agreements`, dados);
    assert.equal(r.status, 409);
  });

  it('mudar o prazo entra na trilha: é a alteração que mais dói num relatório', async () => {
    const criado = await admin.post<{ id: string }>('/agreements', {
      name: 'Vai ser afrouxado',
      kind: 'SLA',
      target: 'TTR',
      durationSeconds: 2 * 3600,
    });

    await admin.patch(`/agreements/${criado.corpo.id}`, { durationSeconds: 48 * 3600 });

    const trilha = await admin.get<
      { action: string; diff: Record<string, { de: unknown; para: unknown }> | null }[]
    >(`/audit-logs?entity=Agreement&entityId=${criado.corpo.id}`);

    const edicao = trilha.corpo.find((e) => e.action === 'acordo.editado');
    assert.deepEqual(
      edicao?.diff?.durationSeconds,
      { de: 7200, para: 172800 },
      'a trilha responde "quem afrouxou isto" seis meses depois',
    );
  });

  it('nível sem ação é recusado: ele não faria nada ao disparar', async () => {
    const acordo = await admin.post<{ id: string }>('/agreements', {
      name: 'Com escalonamento',
      kind: 'SLA',
      target: 'TTR',
      durationSeconds: 3600,
    });

    const semAcao = await admin.post(`/agreements/${acordo.corpo.id}/niveis`, {
      name: 'Nível vazio',
      offsetSeconds: -1800,
      actions: [],
    });
    assert.equal(semAcao.status, 400);

    const comAcao = await admin.post(`/agreements/${acordo.corpo.id}/niveis`, {
      name: 'Avisa o supervisor',
      offsetSeconds: -1800,
      actions: [{ tipo: 'NOTIFICAR', alvo: 'SUPERVISOR' }],
    });
    assert.equal(comAcao.status, 201, JSON.stringify(comAcao.corpo));
  });

  it('o agente não configura SLA', async () => {
    assert.equal((await agente.get('/agreements')).status, 403);
    assert.equal((await agente.get('/calendars')).status, 403);
  });
});

// ---------------------------------------------------------------------

describe('motivos de pendência', () => {
  it('resolver por inatividade exige intervalo de cobrança', async () => {
    const r = await admin.post<{ detail?: string }>('/pending-reasons', {
      name: 'Incoerente',
      followupIntervalSeconds: 0,
      followupsBeforeResolution: 3,
    });

    assert.equal(r.status, 400);
    assert.ok(
      String(r.corpo.detail ?? '').includes('intervalo'),
      'cobrar sem nunca resolver é insistir para sempre; resolver sem cobrar é encerrar sem avisar',
    );
  });

  it('cria e edita', async () => {
    const criado = await admin.post<{ id: string }>('/pending-reasons', {
      name: 'Aguardando peça do fornecedor',
      followupIntervalSeconds: 3 * 24 * 3600,
      followupsBeforeResolution: 2,
      followupTemplate: 'A peça do chamado {{numero}} ainda não chegou.',
    });

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    const editado = await admin.patch<{ followupsBeforeResolution: number }>(
      `/pending-reasons/${criado.corpo.id}`,
      { followupsBeforeResolution: 4 },
    );
    assert.equal(editado.corpo.followupsBeforeResolution, 4);
  });

  it('motivo em uso não é excluído', async () => {
    const motivo = await admin.post<{ id: string }>('/pending-reasons', {
      name: 'Em uso por um chamado',
      followupIntervalSeconds: 3600,
    });

    const chamado = await agente.post<{ id: string }>('/tickets', {
      subject: 'Vai pausar',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await agente.post(`/tickets/${chamado.corpo.id}/pausar`, {
      pendingReasonId: motivo.corpo.id,
    });

    const r = await admin.del<{ detail?: string }>(`/pending-reasons/${motivo.corpo.id}`);

    assert.equal(r.status, 409);
    assert.ok(
      String(r.corpo.detail ?? '').includes('chamado'),
      'excluir deixaria a tela do chamado sem explicar por que ele está parado',
    );
  });

  it('motivo sem uso é excluído', async () => {
    const motivo = await admin.post<{ id: string }>('/pending-reasons', {
      name: 'Nunca usado',
    });

    assert.equal((await admin.del(`/pending-reasons/${motivo.corpo.id}`)).status, 204);
  });
});
