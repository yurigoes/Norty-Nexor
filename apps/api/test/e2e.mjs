/**
 * Suíte de ponta a ponta contra a API real.
 *
 *   node apps/api/test/e2e.mjs
 *   API_URL=http://192.168.15.75:3061/v1 node apps/api/test/e2e.mjs
 *
 * Exercita autenticação, isolamento entre condomínios, permissões por
 * papel e os cinco fluxos principais. Precisa do banco semeado com
 * `--demo` (as contas de demonstração).
 *
 * É repetível de propósito: usa data inédita para a reserva e procura um
 * profissional ainda não avaliado, porque a unicidade de horário e a de
 * avaliação por unidade são regras reais — reusar os mesmos valores faria
 * a segunda execução falhar por motivo certo. E respeita o limitador de
 * login com backoff, em vez de acusar falha ao esbarrar na própria
 * proteção do sistema.
 */
const BASE = process.env.API_URL ?? 'http://127.0.0.1:3333/v1';
let falhas = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) falhas += 1;
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}${extra ? ` — ${extra}` : ''}`);
};

const jar = new Map();
async function call(path, { method = 'GET', body, token, condo, raw } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (condo) headers['x-condominium-id'] = condo;
  const cookies = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookies) headers.Cookie = cookies;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    jar.set(k.trim(), v);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return raw ? { status: res.status, data } : data;
}

// A API limita o login a 8 tentativas por minuto por IP — o que é o
// comportamento correto. A suíte faz seis logins por execução, então
// rodá-la duas vezes seguidas esbarra no limite. Espera e repete em vez
// de reportar uma falha que é da bancada, não do sistema.
const tentarLogin = async (body) => {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const r = await call('/auth/login', { method: 'POST', body, raw: true });
    if (r.status !== 429) return r;
    process.stdout.write('  (limite de login atingido, aguardando 20s)\n');
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  throw new Error('Limite de login persistiu após cinco tentativas.');
};

const login = (email) => tentarLogin({ email, password: '123456' });

console.log('--- Autenticação ---');
const bad = await tentarLogin({ email: 'morador@myhome.test', password: 'errada' });
ok(bad.status === 401, 'senha errada é recusada', `status ${bad.status}`);
ok(bad.data?.message === 'E-mail ou senha incorretos.', 'mensagem não revela se o e-mail existe');

const ghost = await tentarLogin({ email: 'naoexiste@myhome.test', password: '123456' });
ok(ghost.data?.message === bad.data?.message, 'e-mail inexistente devolve a mesma mensagem');

const morador = await login('morador@myhome.test');
ok(morador.status === 200 && morador.data.accessToken, 'login do morador');
const tk = morador.data.accessToken;
const condo = morador.data.user.condominiumIds[0];
ok(morador.data.user.permissions.includes('professionals.view'), 'permissões vêm da matriz compartilhada');
ok(!('password' in morador.data.user) && !('passwordHash' in morador.data.user), 'resposta não expõe senha');

const semToken = await call('/units', { raw: true });
ok(semToken.status === 401, 'rota protegida sem token devolve 401');

console.log('\n--- Sessão e escopo ---');
const sess = await call('/auth/session', { token: tk, condo });
ok(sess?.condominium?.name === 'Residencial Parque Central', 'sessão traz o condomínio');
ok(sess?.unit?.label === '1204', 'sessão traz a unidade do morador', sess?.unit?.label);
ok(sess?.condominium?.unitsCount === 1248, 'contagem de unidades', String(sess?.condominium?.unitsCount));

const outroCondo = await call('/units', { token: tk, condo: 'condominio-de-outro-cliente', raw: true });
ok(outroCondo.status === 403, 'condomínio sem vínculo é bloqueado', `status ${outroCondo.status}`);

console.log('\n--- Permissões por papel ---');
const portaria = await login('portaria@myhome.test');
const tkPort = portaria.data.accessToken;
const condoPort = portaria.data.user.condominiumIds[0];
const negado = await call('/audit', { token: tkPort, condo: condoPort, raw: true });
ok(negado.status === 403, 'portaria não acessa auditoria', `status ${negado.status}`);

const sindico = await login('sindico@myhome.test');
const tkSind = sindico.data.accessToken;
const condoSind = sindico.data.user.condominiumIds[0];
const auditoria = await call('/audit', { token: tkSind, condo: condoSind, raw: true });
ok(auditoria.status === 200, 'síndico acessa auditoria');

console.log('\n--- Fluxo 1: visitante ---');
const vis = await call('/visitors', {
  method: 'POST', token: tk, condo,
  body: {
    name: 'Joana Prestes', document: '123.456.789-00', kind: 'unica', category: 'visita',
    expectedDate: new Date().toISOString().slice(0, 10), expectedTime: '19:30',
  },
  raw: true,
});
ok(vis.status === 201, 'morador autoriza visitante', `status ${vis.status}`);
const codigo = vis.data?.code;
ok(/^[A-Z0-9]{6}$/.test(codigo ?? ''), 'código de 6 caracteres gerado', codigo);

const achado = await call(`/visitors/code/${codigo}`, { token: tkPort, condo: condoPort });
ok(achado?.name === 'Joana Prestes', 'portaria valida o QR pelo código');

const entrada = await call(`/visitors/${vis.data.id}/check-in`, { method: 'POST', token: tkPort, condo: condoPort, raw: true });
ok(entrada.status === 201 && entrada.data.status === 'no_local', 'portaria libera a entrada');

const notif = await call('/notifications', { token: tk, condo });
ok(notif?.some((n) => n.kind === 'visitante_chegou'), 'morador é notificado da chegada');

console.log('\n--- Fluxo 2: encomenda ---');
const unidade = sess.unit.id;
const enc = await call('/deliveries', {
  method: 'POST', token: tkPort, condo: condoPort,
  body: { unitId: unidade, carrier: 'Correios', trackingCode: 'BR123456789BR', size: 'media', shelf: 'A2' },
  raw: true,
});
ok(enc.status === 201, 'portaria registra encomenda', `status ${enc.status}`);
const minhas = await call('/deliveries', { token: tk, condo });
ok(minhas?.items?.some((d) => d.id === enc.data.id), 'encomenda aparece para o morador');
const retirada = await call(`/deliveries/${enc.data.id}/pickup`, {
  method: 'POST', token: tkPort, condo: condoPort, body: { pickedUpBy: 'Carlos Almeida' }, raw: true,
});
ok(retirada.data?.status === 'retirada', 'retirada registrada');

console.log('\n--- Fluxo 3: reserva ---');
const areas = await call('/common-areas', { token: tk, condo });
const salao = areas.find((a) => a.kind === 'salao_festas');
// Data inédita a cada execução: a unicidade (área, data, horário) é uma
// regra real, então reusar a mesma data faria a segunda rodada falhar por
// motivo certo. O deslocamento aleatório evita colidir com rodadas velhas.
const amanha = new Date();
amanha.setDate(amanha.getDate() + 40 + Math.floor(Math.random() * 300));
// Procura um dia em que o salão abre.
let dia = new Date(amanha);
for (let i = 0; i < 8; i += 1) {
  const disp = await call(`/common-areas/${salao.id}/availability`, { token: tk, condo, });
  if (!disp.closed) break;
  dia.setDate(dia.getDate() + 1);
}
const dataStr = dia.toISOString().slice(0, 10);
const disp = await call(`/common-areas/${salao.id}/availability?date=${dataStr}`, { token: tk, condo });
ok(Array.isArray(disp.slots), 'disponibilidade responde por data', disp.closed ? 'fechado nesse dia' : `${disp.slots.length} horários`);

const res1 = await call('/reservations', {
  method: 'POST', token: tk, condo,
  body: { areaId: salao.id, date: dataStr, slot: '17:00 - 23:00', guests: 40 }, raw: true,
});
const res2 = await call('/reservations', {
  method: 'POST', token: tk, condo,
  body: { areaId: salao.id, date: dataStr, slot: '17:00 - 23:00', guests: 20 }, raw: true,
});
if (disp.closed) {
  ok(res1.status === 400, 'reserva em dia fechado é recusada');
} else {
  ok(res1.status === 201, 'reserva criada', `status ${res1.status}`);
  ok(res2.status === 409, 'horário duplicado é bloqueado pelo banco', `status ${res2.status}`);
  const excesso = await call('/reservations', {
    method: 'POST', token: tk, condo,
    body: { areaId: salao.id, date: dataStr, slot: '10:00 - 16:00', guests: 900 }, raw: true,
  });
  ok(excesso.status === 400, 'capacidade da área é validada', excesso.data?.message);
}

console.log('\n--- Fluxo 4: chamado ---');
const cham = await call('/tickets', {
  method: 'POST', token: tk, condo,
  body: { category: 'Hidráulica', location: 'Apto 1204', title: 'Vazamento na pia', description: 'Pia da cozinha pingando desde ontem.', priority: 'alta' },
  raw: true,
});
ok(cham.status === 201, 'morador abre chamado', `status ${cham.status}`);
const atual = await call(`/tickets/${cham.data.id}/updates`, {
  method: 'POST', token: tkSind, condo: condoSind,
  body: { message: 'Encanador acionado para amanhã às 9h.', status: 'em_andamento' }, raw: true,
});
ok(atual.data?.status === 'em_andamento', 'síndico atualiza o chamado');
ok(atual.data?.updates?.length === 2, 'histórico do chamado tem duas entradas');

console.log('\n--- Fluxo 5: profissionais ---');
const profs = await call('/professionals', { token: tk, condo, });
ok(profs?.total > 0, 'catálogo responde', `${profs?.total} profissionais`);
const cats = await call('/professionals/categories', { token: tk, condo });
ok(cats?.length > 0, 'categorias agrupadas', `${cats?.length} categorias`);
const alvo = profs.items[0];
const pedido = await call('/professionals/requests', {
  method: 'POST', token: tk, condo,
  body: { professionalId: alvo.id, service: 'Trocar o chuveiro', description: 'Chuveiro parou de esquentar.' }, raw: true,
});
ok(pedido.status === 201, 'pedido de orçamento enviado', `status ${pedido.status}`);
// Procura um profissional que esta unidade ainda não avaliou — a regra
// é uma avaliação por unidade por profissional.
let av1 = { status: 0 };
let avaliado = null;
for (const candidato of profs.items.slice(0, 40)) {
  const r = await call(`/professionals/${candidato.id}/reviews`, {
    method: 'POST', token: tk, condo,
    body: { rating: 5, service: 'Instalação', comment: 'Chegou no horário e resolveu.' }, raw: true,
  });
  if (r.status === 201) { av1 = r; avaliado = candidato; break; }
  if (r.status !== 409) { av1 = r; break; }
}
const av2 = await call(`/professionals/${(avaliado ?? alvo).id}/reviews`, {
  method: 'POST', token: tk, condo, body: { rating: 1, service: 'Instalação', comment: 'Tentando avaliar de novo.' }, raw: true,
});
ok(av1.status === 201, 'avaliação publicada');
ok(av2.status === 409, 'uma unidade não avalia duas vezes', `status ${av2.status}`);

console.log('\n--- Validação de entrada ---');
const invalido = await call('/tickets', {
  method: 'POST', token: tk, condo, body: { category: 'X', location: 'Y', title: 'ab', description: 'c', priority: 'inexistente' }, raw: true,
});
ok(invalido.status === 400, 'dados inválidos são recusados', `status ${invalido.status}`);
const extra = await call('/tickets', {
  method: 'POST', token: tk, condo,
  body: { category: 'Elétrica', location: 'Hall', title: 'Teste campo extra', description: 'Descricao valida', priority: 'normal', campoInventado: 1 },
  raw: true,
});
ok(extra.status === 400, 'campo desconhecido é recusado', `status ${extra.status}`);

console.log('\n--- Renovação e logout ---');
const renov = await call('/auth/refresh', { method: 'POST', raw: true });
ok(renov.status === 200 && renov.data.accessToken, 'refresh emite novo access token');
const saiu = await call('/auth/logout', { method: 'POST', token: renov.data.accessToken, raw: true });
ok(saiu.status === 204, 'logout encerra a sessão');
const depois = await call('/auth/session', { token: renov.data.accessToken, raw: true });
ok(depois.status === 401, 'token deixa de valer após o logout', `status ${depois.status}`);

console.log(`\n${falhas === 0 ? 'TODOS OS TESTES PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
