import { Client, InvalidCredentialsError } from 'ldapts';

/**
 * Conversa com o diretório (LDAP/AD) no mesmo roteiro do GLPI
 * (`Auth::connection_ldap` + `AuthLDAP::searchUserDn`, ver docs/13):
 *
 * 1. conecta e, se configurado, faz StartTLS;
 * 2. autentica com a conta de serviço (ou segue anônimo);
 * 3. procura a pessoa: `(&(<loginField>=<login escapado>)<filtro extra>)`;
 * 4. exige exatamente um resultado — zero ou dois é "não achei";
 * 5. faz bind com o DN encontrado e a senha digitada. **É esse bind que
 *    valida a senha**: o Desk nunca lê nem guarda a senha do diretório.
 *
 * O que separa "senha errada" de "diretório fora do ar" é o tipo do erro:
 * o primeiro volta como resultado, o segundo como `ErroDeDiretorio`. O
 * login trata os dois de forma diferente — o segundo não pode virar
 * "usuário ou senha inválidos", senão uma queda do AD parece senha errada
 * para a empresa inteira.
 */

export type FonteLdap = {
  host: string;
  port: number;
  security: 'NONE' | 'STARTTLS' | 'LDAPS';
  baseDn: string;
  bindDn: string | null;
  loginField: string;
  syncField: string;
  userFilter: string | null;
  emailField: string;
  nameField: string;
  phoneField: string | null;
  timeoutMs: number;
};

export type PessoaDoDiretorio = {
  dn: string;
  /** O login como o diretório o escreve (o que a pessoa digitou pode vir em outra caixa). */
  login: string;
  /** Valor do `syncField`, estável mesmo se o login mudar. Binário (objectGUID) vira hex. */
  externalId: string | null;
  email: string | null;
  nome: string | null;
  telefone: string | null;
};

export type ResultadoLdap =
  | { ok: true; pessoa: PessoaDoDiretorio }
  | { ok: false; motivo: 'nao-encontrado' | 'ambiguo' | 'senha' };

/** O diretório não respondeu ou recusou a conta de serviço. Não é "senha errada". */
export class ErroDeDiretorio extends Error {
  override readonly name = 'ErroDeDiretorio';
}

export type Entrada = Record<string, unknown> & { dn: string };

/** A parte do cliente LDAP que o fluxo usa — é o que os testes trocam por uma falsa. */
export interface ConexaoLdap {
  bind(dn: string, senha: string): Promise<void>;
  buscar(base: string, filtro: string, atributos: string[], escopo?: 'base' | 'sub'): Promise<Entrada[]>;
  fechar(): Promise<void>;
}

/**
 * Escape de valor em filtro (RFC 4515). Sem isso, `*` no campo de login
 * vira curinga e `)(` abre uma condição nova — injeção de filtro.
 */
export function escaparFiltro(valor: string): string {
  return valor.replace(/[\\*()\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

export function montarFiltro(loginField: string, login: string, extra: string | null): string {
  const base = `(${loginField}=${escaparFiltro(login)})`;
  const condicao = extra?.trim();
  if (!condicao) return base;
  return `(&${base}${condicao.startsWith('(') ? condicao : `(${condicao})`})`;
}

/** Atributo por nome, sem diferenciar caixa: o AD devolve `sAMAccountName`, o OpenLDAP `uid`. */
function atributo(entrada: Entrada, nome: string): unknown {
  if (nome in entrada) return entrada[nome];
  const chave = Object.keys(entrada).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave ? entrada[chave] : undefined;
}

function comoTexto(bruto: unknown): string | null {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (valor === undefined || valor === null) return null;
  if (Buffer.isBuffer(valor)) return valor.length ? valor.toString('hex') : null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

export async function abrirConexao(fonte: FonteLdap): Promise<ConexaoLdap> {
  const esquema = fonte.security === 'LDAPS' ? 'ldaps' : 'ldap';
  const cliente = new Client({
    url: `${esquema}://${fonte.host}:${fonte.port}`,
    timeout: fonte.timeoutMs,
    connectTimeout: fonte.timeoutMs,
  });

  if (fonte.security === 'STARTTLS') {
    try {
      await cliente.startTLS({});
    } catch (e) {
      await cliente.unbind().catch(() => undefined);
      throw new ErroDeDiretorio(`O diretório recusou o StartTLS: ${(e as Error).message}`);
    }
  }

  return {
    bind: (dn, senha) => cliente.bind(dn, senha),
    buscar: async (base, filtro, atributos, escopo = 'sub') => {
      const { searchEntries } = await cliente.search(base, {
        scope: escopo,
        filter: filtro,
        attributes: atributos,
        // Dois bastam para saber que é ambíguo.
        sizeLimit: 2,
        explicitBufferAttributes: ['objectGUID', 'objectSid'],
      });
      return searchEntries as Entrada[];
    },
    fechar: () => cliente.unbind().catch(() => undefined),
  };
}

/** Abre a conexão e autentica a conta de serviço. Qualquer falha é do diretório. */
async function conectarComoServico(
  fonte: FonteLdap,
  senhaDeServico: string | null,
  abrir: (fonte: FonteLdap) => Promise<ConexaoLdap>,
): Promise<ConexaoLdap> {
  let conexao: ConexaoLdap;
  try {
    conexao = await abrir(fonte);
  } catch (e) {
    if (e instanceof ErroDeDiretorio) throw e;
    throw new ErroDeDiretorio(`Sem conexão com ${fonte.host}:${fonte.port}: ${(e as Error).message}`);
  }

  if (fonte.bindDn) {
    try {
      await conexao.bind(fonte.bindDn, senhaDeServico ?? '');
    } catch (e) {
      await conexao.fechar();
      throw new ErroDeDiretorio(
        e instanceof InvalidCredentialsError
          ? 'O diretório recusou a conta de serviço.'
          : `Falha no bind da conta de serviço: ${(e as Error).message}`,
      );
    }
  }
  return conexao;
}

type Procura = { ok: true; entrada: Entrada } | { ok: false; motivo: 'nao-encontrado' | 'ambiguo' };

/** Passo 3 e 4 do GLPI: a busca pelo login, exigindo exatamente um resultado. */
async function procurar(conexao: ConexaoLdap, fonte: FonteLdap, login: string): Promise<Procura> {
  const atributos = [
    fonte.loginField,
    fonte.syncField,
    fonte.emailField,
    fonte.nameField,
    ...(fonte.phoneField ? [fonte.phoneField] : []),
  ];

  let entradas: Entrada[];
  try {
    entradas = await conexao.buscar(
      fonte.baseDn,
      montarFiltro(fonte.loginField, login.trim(), fonte.userFilter),
      atributos,
    );
  } catch (e) {
    const nome = (e as Error).name;
    // errno 32 no GLPI: base sem o objeto — é "não achei", não queda.
    if (nome === 'NoSuchObjectError') return { ok: false, motivo: 'nao-encontrado' };
    if (nome === 'SizeLimitExceededError') return { ok: false, motivo: 'ambiguo' };
    throw new ErroDeDiretorio(`O diretório recusou a busca: ${(e as Error).message}`);
  }

  if (entradas.length === 0) return { ok: false, motivo: 'nao-encontrado' };
  if (entradas.length > 1) return { ok: false, motivo: 'ambiguo' };
  return { ok: true, entrada: entradas[0]! };
}

function paraPessoa(fonte: FonteLdap, entrada: Entrada, digitado: string): PessoaDoDiretorio {
  return {
    dn: entrada.dn,
    login: comoTexto(atributo(entrada, fonte.loginField)) ?? digitado.trim(),
    externalId: comoTexto(atributo(entrada, fonte.syncField)),
    email: comoTexto(atributo(entrada, fonte.emailField))?.toLowerCase() ?? null,
    nome: comoTexto(atributo(entrada, fonte.nameField)),
    telefone: fonte.phoneField ? comoTexto(atributo(entrada, fonte.phoneField)) : null,
  };
}

export async function autenticar(
  fonte: FonteLdap,
  senhaDeServico: string | null,
  login: string,
  senha: string,
  abrir: (fonte: FonteLdap) => Promise<ConexaoLdap> = abrirConexao,
): Promise<ResultadoLdap> {
  // Bind com senha vazia é bind anônimo em muitos servidores, e eles
  // respondem sucesso. Sem esta linha, senha em branco entraria em
  // qualquer conta do diretório.
  if (!senha || !login.trim()) return { ok: false, motivo: 'senha' };

  const conexao = await conectarComoServico(fonte, senhaDeServico, abrir);
  try {
    const achou = await procurar(conexao, fonte, login);
    if (!achou.ok) return achou;

    try {
      await conexao.bind(achou.entrada.dn, senha);
    } catch (e) {
      if (e instanceof InvalidCredentialsError) return { ok: false, motivo: 'senha' };
      throw new ErroDeDiretorio(`Falha ao validar a senha no diretório: ${(e as Error).message}`);
    }

    return { ok: true, pessoa: paraPessoa(fonte, achou.entrada, login) };
  } finally {
    await conexao.fechar();
  }
}

export type ResultadoDoTeste = {
  ok: boolean;
  mensagem: string;
  /** Presente quando o teste procurou alguém e achou. */
  pessoa?: PessoaDoDiretorio;
};

/**
 * O "Testar" da tela: conexão, conta de serviço, base e, se veio um login,
 * a busca por ele — sem a senha da pessoa, que o administrador não tem.
 * Nunca lança: a resposta vira mensagem na tela.
 */
export async function testarFonte(
  fonte: FonteLdap,
  senhaDeServico: string | null,
  login?: string | null,
  abrir: (fonte: FonteLdap) => Promise<ConexaoLdap> = abrirConexao,
): Promise<ResultadoDoTeste> {
  let conexao: ConexaoLdap;
  try {
    conexao = await conectarComoServico(fonte, senhaDeServico, abrir);
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  try {
    try {
      await conexao.buscar(fonte.baseDn, '(objectClass=*)', ['objectClass'], 'base');
    } catch (e) {
      return {
        ok: false,
        mensagem:
          (e as Error).name === 'NoSuchObjectError'
            ? `A base "${fonte.baseDn}" não existe neste diretório.`
            : `A conta de serviço entrou, mas não leu a base: ${(e as Error).message}`,
      };
    }

    const servico = fonte.bindDn ? 'Conta de serviço aceita' : 'Busca anônima aceita';
    if (!login?.trim()) return { ok: true, mensagem: `${servico} e base encontrada.` };

    const achou = await procurar(conexao, fonte, login);
    if (!achou.ok) {
      return {
        ok: false,
        mensagem:
          achou.motivo === 'ambiguo'
            ? `Mais de uma pessoa com ${fonte.loginField}=${login.trim()}: ajuste o filtro extra.`
            : `${servico}, mas ninguém com ${fonte.loginField}=${login.trim()} na base (com o filtro extra).`,
      };
    }
    const pessoa = paraPessoa(fonte, achou.entrada, login);
    return {
      ok: true,
      mensagem: pessoa.externalId
        ? `Encontrada: ${pessoa.dn}`
        : `Encontrada, mas sem ${fonte.syncField}: o vínculo vai depender só do login.`,
      pessoa,
    };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    await conexao.fechar();
  }
}
