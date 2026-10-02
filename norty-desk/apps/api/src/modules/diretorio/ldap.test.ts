import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvalidCredentialsError } from 'ldapts';

import {
  autenticar,
  ErroDeDiretorio,
  escaparFiltro,
  montarFiltro,
  testarFonte,
  type ConexaoLdap,
  type Entrada,
  type FonteLdap,
} from './ldap';

const FONTE: FonteLdap = {
  host: 'ad.exemplo.dev',
  port: 389,
  security: 'STARTTLS',
  baseDn: 'DC=exemplo,DC=dev',
  bindDn: 'CN=svc-desk,OU=Servicos,DC=exemplo,DC=dev',
  loginField: 'sAMAccountName',
  syncField: 'objectGUID',
  userFilter: '(objectClass=user)',
  emailField: 'mail',
  nameField: 'displayName',
  phoneField: 'telephoneNumber',
  timeoutMs: 1000,
  grupos: {
    busca: 'ATRIBUTO',
    campoDoUsuario: 'memberOf',
    campoDoMembro: 'member',
    filtro: '(objectClass=group)',
    baseDn: null,
    aninhados: false,
  },
  replicas: [],
};

const MARIA: Entrada = {
  dn: 'CN=Maria Souza,OU=Pessoas,DC=exemplo,DC=dev',
  sAMAccountName: 'msouza',
  objectGUID: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
  mail: 'Maria.Souza@Exemplo.dev',
  displayName: 'Maria Souza',
  telephoneNumber: '71 3333-0000',
  memberOf: [
    'CN=TI-Suporte,OU=Grupos,DC=exemplo,DC=dev',
    'CN=Todos,OU=Grupos,DC=exemplo,DC=dev',
  ],
};

/** Diretório falso: registra o que o fluxo pediu e responde o combinado. */
function diretorio(opcoes: {
  entradas?: Entrada[];
  senhas?: Record<string, string>;
  erroNaBusca?: Error;
  /** Resposta por filtro: é como o teste separa a busca do login da de grupos. */
  porFiltro?: (filtro: string) => Entrada[];
  /** Servidores que não atendem: `abrir` falha como quem teve a conexão recusada. */
  fora?: string[];
  /** Por servidor, os DNs que ele recusa — a senha que ainda não replicou. */
  recusa?: Record<string, string[]>;
}) {
  const binds: string[] = [];
  const filtros: string[] = [];
  const atributos: string[][] = [];
  const aberturas: string[] = [];
  let fechamentos = 0;

  const conexaoDe = (endereco: string): ConexaoLdap => ({
    async bind(dn, senha) {
      binds.push(dn);
      if (opcoes.recusa?.[endereco]?.includes(dn)) {
        throw new InvalidCredentialsError('credenciais inválidas');
      }
      if (opcoes.senhas?.[dn] !== senha) throw new InvalidCredentialsError('credenciais inválidas');
    },
    async buscar(_base, filtro, pedidos) {
      filtros.push(filtro);
      atributos.push(pedidos);
      if (opcoes.erroNaBusca) throw opcoes.erroNaBusca;
      if (opcoes.porFiltro) return opcoes.porFiltro(filtro);
      return opcoes.entradas ?? [];
    },
    async fechar() {
      fechamentos += 1;
    },
  });

  return {
    abrir: async (f: FonteLdap) => {
      const endereco = `${f.host}:${f.port}`;
      aberturas.push(endereco);
      if (opcoes.fora?.includes(endereco)) throw new Error('ECONNREFUSED');
      return conexaoDe(endereco);
    },
    binds,
    filtros,
    atributos,
    /** Os endereços tentados, na ordem. É o que prova a ordem do reserva. */
    aberturas,
    get fechamentos() {
      return fechamentos;
    },
    get fechada() {
      return fechamentos > 0;
    },
    get aberta() {
      return aberturas.length > 0;
    },
  };
}

const SENHAS = { [FONTE.bindDn!]: 'servico', [MARIA.dn]: 'certa' };

/** O servidor da própria fonte, que é quem atende quando está de pé. */
const PRINCIPAL = { host: FONTE.host, port: FONTE.port };

describe('filtro LDAP', () => {
  it('escapa curinga, parênteses e barra — sem injeção de filtro', () => {
    assert.equal(escaparFiltro('a*b(c)\\'), 'a\\2ab\\28c\\29\\5c');
    assert.equal(montarFiltro('uid', '*)(uid=*', null), '(uid=\\2a\\29\\28uid=\\2a)');
  });

  it('combina o filtro extra num (& ...), com ou sem parênteses', () => {
    assert.equal(montarFiltro('uid', 'ana', '(objectClass=person)'), '(&(uid=ana)(objectClass=person))');
    assert.equal(montarFiltro('uid', 'ana', 'objectClass=person'), '(&(uid=ana)(objectClass=person))');
    assert.equal(montarFiltro('uid', 'ana', '  '), '(uid=ana)');
  });
});

describe('autenticação no diretório', () => {
  it('conta de serviço, busca, bind da pessoa — e devolve os dados normalizados', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(FONTE, 'servico', 'MSouza', 'certa', d.abrir);

    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.pessoa, {
      dn: MARIA.dn,
      login: 'msouza',
      externalId: '00112233445566778899aabbccddeeff',
      email: 'maria.souza@exemplo.dev',
      nome: 'Maria Souza',
      telefone: '71 3333-0000',
      grupos: MARIA.memberOf,
    });
    assert.deepEqual(d.binds, [FONTE.bindDn, MARIA.dn]);
    assert.deepEqual(d.filtros, ['(&(sAMAccountName=MSouza)(objectClass=user))']);
    assert.equal(d.fechada, true);
  });

  it('recusa senha vazia sem nem abrir conexão — bind vazio seria anônimo', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(FONTE, 'servico', 'msouza', '', d.abrir);
    assert.deepEqual(r, { ok: false, motivo: 'senha', servidor: null });
    assert.equal(d.aberta, false);
  });

  it('senha errada volta como resultado, não como erro', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(FONTE, 'servico', 'msouza', 'errada', d.abrir);
    assert.deepEqual(r, { ok: false, motivo: 'senha', servidor: PRINCIPAL });
    assert.equal(d.fechada, true);
  });

  it('zero resultados é não encontrado; dois é ambíguo', async () => {
    const nenhum = await autenticar(FONTE, 'servico', 'x', 'y', diretorio({ senhas: SENHAS }).abrir);
    assert.deepEqual(nenhum, { ok: false, motivo: 'nao-encontrado', servidor: PRINCIPAL });

    const dois = diretorio({ entradas: [MARIA, { ...MARIA, dn: 'CN=Outra,DC=exemplo,DC=dev' }], senhas: SENHAS });
    assert.deepEqual(await autenticar(FONTE, 'servico', 'msouza', 'certa', dois.abrir), {
      ok: false,
      motivo: 'ambiguo',
      servidor: PRINCIPAL,
    });
  });

  it('conta de serviço recusada é falha do diretório, não senha errada da pessoa', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    await assert.rejects(() => autenticar(FONTE, 'senha-velha', 'msouza', 'certa', d.abrir), ErroDeDiretorio);
    assert.equal(d.fechada, true);
  });

  it('queda na busca é falha do diretório; base inexistente é não encontrado', async () => {
    const queda = diretorio({ senhas: SENHAS, erroNaBusca: new Error('ECONNRESET') });
    await assert.rejects(() => autenticar(FONTE, 'servico', 'msouza', 'certa', queda.abrir), ErroDeDiretorio);

    const erro32 = new Error('no such object');
    erro32.name = 'NoSuchObjectError';
    const semBase = diretorio({ senhas: SENHAS, erroNaBusca: erro32 });
    assert.deepEqual(await autenticar(FONTE, 'servico', 'msouza', 'certa', semBase.abrir), {
      ok: false,
      motivo: 'nao-encontrado',
      servidor: PRINCIPAL,
    });
  });

  it('sem conta de serviço, busca anônima', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar({ ...FONTE, bindDn: null }, null, 'msouza', 'certa', d.abrir);
    assert.equal(r.ok, true);
    assert.deepEqual(d.binds, [MARIA.dn]);
  });
});

describe('teste da fonte', () => {
  it('sem login: conta de serviço e base', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await testarFonte(FONTE, 'servico', null, d.abrir);
    assert.equal(r.ok, true);
    assert.match(r.mensagem, /base encontrada/);
    assert.deepEqual(d.filtros, ['(objectClass=*)']);
    assert.equal(d.fechada, true);
  });

  it('com login: procura sem autenticar a pessoa', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await testarFonte(FONTE, 'servico', 'msouza', d.abrir);
    assert.equal(r.ok, true);
    assert.equal(r.pessoa?.email, 'maria.souza@exemplo.dev');
    // Só a conta de serviço fez bind: o teste não tem a senha da Maria.
    assert.deepEqual(d.binds, [FONTE.bindDn]);
  });

  it('falhas viram mensagem, nunca exceção', async () => {
    const servico = await testarFonte(FONTE, 'errada', null, diretorio({ senhas: SENHAS }).abrir);
    assert.deepEqual(servico, { ok: false, mensagem: 'O diretório recusou a conta de serviço.' });

    const erro32 = new Error('no such object');
    erro32.name = 'NoSuchObjectError';
    const semBase = await testarFonte(FONTE, 'servico', null, diretorio({ senhas: SENHAS, erroNaBusca: erro32 }).abrir);
    assert.equal(semBase.ok, false);
    assert.match(semBase.mensagem, /não existe/);

    const ninguem = await testarFonte(FONTE, 'servico', 'fulano', diretorio({ senhas: SENHAS }).abrir);
    assert.equal(ninguem.ok, false);
    assert.match(ninguem.mensagem, /ninguém com sAMAccountName=fulano/);
  });
});

/**
 * Réplica: o mesmo diretório noutro servidor.
 *
 * O que estes testes fixam é tanto o que o reserva faz quanto onde ele
 * **para**. Trocar de servidor na conexão salva o login de uma queda;
 * trocar depois dela seria perguntar a mesma coisa duas vezes — e no
 * caso da senha da pessoa, seria tentar a mesma senha errada em cada
 * controlador de domínio da empresa.
 */
describe('réplica do diretório', () => {
  const DC2 = { host: 'dc2.exemplo.dev', port: 389 };
  const DC3 = { host: 'dc3.exemplo.dev', port: 636 };
  const COM_REPLICA: FonteLdap = { ...FONTE, replicas: [DC2, DC3] };

  it('com o principal de pé, ninguém mais é procurado — réplica não é balanceamento', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(COM_REPLICA, 'servico', 'msouza', 'certa', d.abrir);

    assert.equal(r.ok, true);
    assert.deepEqual(r.servidor, PRINCIPAL);
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389']);
  });

  it('principal fora do ar: a réplica seguinte atende, e o login não cai', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS, fora: ['ad.exemplo.dev:389'] });
    const r = await autenticar(COM_REPLICA, 'servico', 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.equal(r.pessoa.login, 'msouza');
    assert.deepEqual(r.servidor, DC2);
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389', 'dc2.exemplo.dev:389']);
  });

  it('a réplica fora passa a vez para a próxima, na ordem cadastrada', async () => {
    const d = diretorio({
      entradas: [MARIA],
      senhas: SENHAS,
      fora: ['ad.exemplo.dev:389', 'dc2.exemplo.dev:389'],
    });
    const r = await autenticar(COM_REPLICA, 'servico', 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.servidor, DC3);
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389', 'dc2.exemplo.dev:389', 'dc3.exemplo.dev:636']);
  });

  /**
   * Senha de serviço recém-trocada demora a replicar, e a réplica que
   * ainda tem a antiga recusa enquanto a outra aceita. Custa pouco
   * tentar: credencial recusada volta rápido.
   */
  it('servidor que recusa a conta de serviço também passa a vez — e fecha a conexão dele', async () => {
    const d = diretorio({
      entradas: [MARIA],
      senhas: SENHAS,
      recusa: { 'ad.exemplo.dev:389': [FONTE.bindDn!] },
    });
    const r = await autenticar(COM_REPLICA, 'servico', 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.servidor, DC2);
    // A do principal e a que atendeu: a recusada não fica aberta pendurada.
    assert.equal(d.fechamentos, 2);
  });

  it('nenhum servidor atende: o erro traz o motivo de cada um', async () => {
    const d = diretorio({
      senhas: SENHAS,
      fora: ['ad.exemplo.dev:389', 'dc3.exemplo.dev:636'],
      recusa: { 'dc2.exemplo.dev:389': [FONTE.bindDn!] },
    });

    await assert.rejects(
      () => autenticar(COM_REPLICA, 'servico', 'msouza', 'certa', d.abrir),
      (e: Error) => {
        assert.ok(e instanceof ErroDeDiretorio);
        assert.match(e.message, /Nenhum dos 3 servidores atendeu/);
        assert.match(e.message, /ad\.exemplo\.dev:389 — Sem conexão/);
        assert.match(e.message, /dc2\.exemplo\.dev:389 — O diretório recusou a conta de serviço/);
        assert.match(e.message, /dc3\.exemplo\.dev:636 — Sem conexão/);
        return true;
      },
    );
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389', 'dc2.exemplo.dev:389', 'dc3.exemplo.dev:636']);
  });

  it('com um servidor só, a mensagem é a de sempre — sem falar de lista', async () => {
    const d = diretorio({ senhas: SENHAS, fora: ['ad.exemplo.dev:389'] });
    await assert.rejects(
      () => autenticar(FONTE, 'servico', 'msouza', 'certa', d.abrir),
      (e: Error) => {
        assert.match(e.message, /^Sem conexão com ad\.exemplo\.dev:389/);
        return true;
      },
    );
  });

  it('senha errada da pessoa não vai perguntar na réplica', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(COM_REPLICA, 'servico', 'msouza', 'errada', d.abrir);

    assert.deepEqual(r, { ok: false, motivo: 'senha', servidor: PRINCIPAL });
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389']);
  });

  it('nem quem não foi encontrado: a réplica é o mesmo diretório, com a mesma resposta', async () => {
    const d = diretorio({ senhas: SENHAS });
    const r = await autenticar(COM_REPLICA, 'servico', 'ninguem', 'certa', d.abrir);

    assert.deepEqual(r, { ok: false, motivo: 'nao-encontrado', servidor: PRINCIPAL });
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389']);
  });

  it('queda no meio da busca não troca de servidor: é erro do diretório, e sobe', async () => {
    const d = diretorio({ senhas: SENHAS, erroNaBusca: new Error('ECONNRESET') });
    await assert.rejects(
      () => autenticar(COM_REPLICA, 'servico', 'msouza', 'certa', d.abrir),
      ErroDeDiretorio,
    );
    assert.deepEqual(d.aberturas, ['ad.exemplo.dev:389']);
  });

  /**
   * Fonte anônima, o caso que o cliente preguiçoso esconde: sem conta de
   * serviço ninguém faz bind na hora de conectar, então abrir "dá certo"
   * mesmo com o servidor fora e a queda só apareceria na busca — tarde
   * demais para trocar de servidor.
   */
  it('sem conta de serviço, o bind anônimo prova o servidor antes de escolhê-lo', async () => {
    const anonima: FonteLdap = { ...COM_REPLICA, bindDn: null };
    const d = diretorio({
      entradas: [MARIA],
      senhas: { ...SENHAS, '': '' },
      recusa: { 'ad.exemplo.dev:389': [''] },
    });

    const r = await autenticar(anonima, null, 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.servidor, DC2);
    assert.deepEqual(d.binds, ['', '', MARIA.dn]);
  });

  it('e com um servidor só não prova nada — fonte anônima que busca sem bind continua funcionando', async () => {
    const anonima: FonteLdap = { ...FONTE, bindDn: null };
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });

    const r = await autenticar(anonima, null, 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(d.binds, [MARIA.dn]);
  });

  it('o teste da fonte avisa quando foi a réplica que atendeu', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS, fora: ['ad.exemplo.dev:389'] });
    const r = await testarFonte(COM_REPLICA, 'servico', null, d.abrir);

    assert.equal(r.ok, true);
    assert.deepEqual(r.servidor, DC2);
    assert.match(r.mensagem, /^Quem atendeu foi a réplica dc2\.exemplo\.dev:389 — o servidor principal não respondeu\./);
    assert.match(r.mensagem, /base encontrada/);
  });

  it('e não avisa nada quando foi o principal', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await testarFonte(COM_REPLICA, 'servico', null, d.abrir);

    assert.deepEqual(r.servidor, PRINCIPAL);
    assert.match(r.mensagem, /^Conta de serviço aceita e base encontrada\.$/);
  });
});

/**
 * Ler os grupos.
 *
 * O `memberOf` do próprio usuário sai de graça; a busca por objeto de
 * grupo é a única que funciona no OpenLDAP, onde não há `memberOf`.
 *
 * O que mais importa aqui é o que **não** acontece: erro na busca de
 * grupos sobe. Quem chama não pode confundir "o diretório caiu" com "a
 * pessoa não está em grupo nenhum" — a segunda tiraria todo mundo dos
 * times na primeira instabilidade de rede.
 */
describe('os grupos da pessoa', () => {
  it('saem do memberOf, sem busca a mais', async () => {
    const d = diretorio({
      entradas: [MARIA],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
    });

    const r = await autenticar(FONTE, '', 'msouza', 'senha-certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.pessoa.grupos, [
      'CN=TI-Suporte,OU=Grupos,DC=exemplo,DC=dev',
      'CN=Todos,OU=Grupos,DC=exemplo,DC=dev',
    ]);
    // Uma busca só: a do login. O `memberOf` veio junto na entrada.
    assert.equal(d.filtros.length, 1);
  });

  it('são pedidos junto com o resto dos atributos', async () => {
    const d = diretorio({
      entradas: [MARIA],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
    });

    await autenticar(FONTE, '', 'msouza', 'senha-certa', d.abrir);

    assert.ok(d.atributos[0]?.includes('memberOf'), JSON.stringify(d.atributos[0]));
  });

  it('saem da busca por objeto de grupo quando não há memberOf', async () => {
    const semMemberOf = { ...MARIA };
    delete (semMemberOf as Record<string, unknown>).memberOf;

    const fonte: FonteLdap = { ...FONTE, grupos: { ...FONTE.grupos, busca: 'OBJETO' } };

    const d = diretorio({
      entradas: [semMemberOf],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
      porFiltro: (filtro) =>
        filtro.includes('member=')
          ? [{ dn: 'CN=Equipe,OU=Grupos,DC=exemplo,DC=dev' }]
          : [semMemberOf],
    });

    const r = await autenticar(fonte, '', 'msouza', 'senha-certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.pessoa.grupos, ['CN=Equipe,OU=Grupos,DC=exemplo,DC=dev']);
    assert.equal(d.filtros.length, 2, 'login e grupos');
  });

  it('junta os dois caminhos sem repetir o mesmo grupo', async () => {
    const fonte: FonteLdap = { ...FONTE, grupos: { ...FONTE.grupos, busca: 'AMBOS' } };

    const d = diretorio({
      entradas: [MARIA],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
      porFiltro: (filtro) =>
        filtro.includes('member=')
          ? // O mesmo grupo que o memberOf já trouxe, mais um novo.
            [
              { dn: 'CN=TI-Suporte,OU=Grupos,DC=exemplo,DC=dev' },
              { dn: 'CN=Plantao,OU=Grupos,DC=exemplo,DC=dev' },
            ]
          : [MARIA],
    });

    const r = await autenticar(fonte, '', 'msouza', 'senha-certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.pessoa.grupos.sort(), [
      'CN=Plantao,OU=Grupos,DC=exemplo,DC=dev',
      'CN=TI-Suporte,OU=Grupos,DC=exemplo,DC=dev',
      'CN=Todos,OU=Grupos,DC=exemplo,DC=dev',
    ]);
  });

  it('usa a regra em cadeia do AD só quando a casa pede', async () => {
    const base: FonteLdap = { ...FONTE, grupos: { ...FONTE.grupos, busca: 'OBJETO' } };

    const simples = diretorio({
      entradas: [MARIA],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
    });
    await autenticar(base, '', 'msouza', 'senha-certa', simples.abrir);

    const aninhado = diretorio({
      entradas: [MARIA],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
    });
    await autenticar(
      { ...base, grupos: { ...base.grupos, aninhados: true } },
      '',
      'msouza',
      'senha-certa',
      aninhado.abrir,
    );

    assert.ok(!simples.filtros[1]?.includes('1.2.840.113556.1.4.1941'), simples.filtros[1]);
    assert.ok(aninhado.filtros[1]?.includes('1.2.840.113556.1.4.1941'), aninhado.filtros[1]);
  });

  it('escapa o DN da pessoa no filtro do grupo', async () => {
    // Sem escape, um DN com `(` ou `*` abriria condição nova no filtro —
    // a mesma injeção que o campo de login já cerca.
    const comParenteses = { ...MARIA, dn: 'CN=Ana (TI),OU=Pessoas,DC=exemplo,DC=dev' };
    const fonte: FonteLdap = { ...FONTE, grupos: { ...FONTE.grupos, busca: 'OBJETO' } };

    const d = diretorio({
      entradas: [comParenteses],
      senhas: { [comParenteses.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
    });

    await autenticar(fonte, '', 'ana', 'senha-certa', d.abrir);

    assert.ok(!d.filtros[1]?.includes('(TI)'), d.filtros[1]);
    assert.ok(d.filtros[1]?.includes('\\28'), d.filtros[1]);
  });

  it('queda na busca de grupos **sobe**, e não vira "sem grupo"', async () => {
    const fonte: FonteLdap = { ...FONTE, grupos: { ...FONTE.grupos, busca: 'OBJETO' } };

    const d = diretorio({
      entradas: [MARIA],
      senhas: { [MARIA.dn]: 'senha-certa', [FONTE.bindDn!]: '' },
      porFiltro: (filtro) => {
        if (filtro.includes('member=')) throw new Error('conexão perdida');
        return [MARIA];
      },
    });

    // Tratar isto como lista vazia tiraria a pessoa de todos os times.
    await assert.rejects(
      () => autenticar(fonte, '', 'msouza', 'senha-certa', d.abrir),
      ErroDeDiretorio,
    );
  });
});
