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
};

const MARIA: Entrada = {
  dn: 'CN=Maria Souza,OU=Pessoas,DC=exemplo,DC=dev',
  sAMAccountName: 'msouza',
  objectGUID: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
  mail: 'Maria.Souza@Exemplo.dev',
  displayName: 'Maria Souza',
  telephoneNumber: '71 3333-0000',
};

/** Diretório falso: registra o que o fluxo pediu e responde o combinado. */
function diretorio(opcoes: {
  entradas?: Entrada[];
  senhas?: Record<string, string>;
  erroNaBusca?: Error;
}) {
  const binds: string[] = [];
  const filtros: string[] = [];
  let fechada = false;
  let aberta = false;

  const conexao: ConexaoLdap = {
    async bind(dn, senha) {
      binds.push(dn);
      if (opcoes.senhas?.[dn] !== senha) throw new InvalidCredentialsError('credenciais inválidas');
    },
    async buscar(_base, filtro) {
      filtros.push(filtro);
      if (opcoes.erroNaBusca) throw opcoes.erroNaBusca;
      return opcoes.entradas ?? [];
    },
    async fechar() {
      fechada = true;
    },
  };

  return {
    abrir: async () => {
      aberta = true;
      return conexao;
    },
    binds,
    filtros,
    get fechada() {
      return fechada;
    },
    get aberta() {
      return aberta;
    },
  };
}

const SENHAS = { [FONTE.bindDn!]: 'servico', [MARIA.dn]: 'certa' };

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
    });
    assert.deepEqual(d.binds, [FONTE.bindDn, MARIA.dn]);
    assert.deepEqual(d.filtros, ['(&(sAMAccountName=MSouza)(objectClass=user))']);
    assert.equal(d.fechada, true);
  });

  it('recusa senha vazia sem nem abrir conexão — bind vazio seria anônimo', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(FONTE, 'servico', 'msouza', '', d.abrir);
    assert.deepEqual(r, { ok: false, motivo: 'senha' });
    assert.equal(d.aberta, false);
  });

  it('senha errada volta como resultado, não como erro', async () => {
    const d = diretorio({ entradas: [MARIA], senhas: SENHAS });
    const r = await autenticar(FONTE, 'servico', 'msouza', 'errada', d.abrir);
    assert.deepEqual(r, { ok: false, motivo: 'senha' });
    assert.equal(d.fechada, true);
  });

  it('zero resultados é não encontrado; dois é ambíguo', async () => {
    const nenhum = await autenticar(FONTE, 'servico', 'x', 'y', diretorio({ senhas: SENHAS }).abrir);
    assert.deepEqual(nenhum, { ok: false, motivo: 'nao-encontrado' });

    const dois = diretorio({ entradas: [MARIA, { ...MARIA, dn: 'CN=Outra,DC=exemplo,DC=dev' }], senhas: SENHAS });
    assert.deepEqual(await autenticar(FONTE, 'servico', 'msouza', 'certa', dois.abrir), {
      ok: false,
      motivo: 'ambiguo',
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
