import { Client, InvalidCredentialsError } from 'ldapts';
import type { BuscaDeGrupo } from '@norty-desk/shared';

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
  grupos: GruposDaFonte;
  /**
   * Outros servidores do **mesmo** diretório, na ordem de tentativa.
   *
   * Só endereço: todo o resto vem da fonte, porque réplica é o mesmo
   * diretório noutro servidor.
   */
  replicas: Servidor[];
};

/** Um endereço de servidor. */
export type Servidor = { host: string; port: number };

/** A parte da fonte que diz como descobrir os grupos. */
export type GruposDaFonte = {
  busca: BuscaDeGrupo;
  campoDoUsuario: string;
  campoDoMembro: string;
  filtro: string | null;
  baseDn: string | null;
  aninhados: boolean;
};

export type PessoaDoDiretorio = {
  dn: string;
  /**
   * Os grupos a que ela pertence, como o diretório os nomeia — DN
   * inteiro no AD.
   *
   * Lista vazia é "procurei e não achou"; a busca que falha lança, e o
   * login não chega aqui. A diferença importa: tratar queda do diretório
   * como "sem grupo" tiraria todo mundo dos times na primeira
   * instabilidade de rede.
   */
  grupos: string[];
  /** O login como o diretório o escreve (o que a pessoa digitou pode vir em outra caixa). */
  login: string;
  /** Valor do `syncField`, estável mesmo se o login mudar. Binário (objectGUID) vira hex. */
  externalId: string | null;
  email: string | null;
  nome: string | null;
  telefone: string | null;
};

/**
 * `servidor` é quem atendeu — o principal ou a réplica que está
 * carregando o login. Nulo só quando nem se chegou a conectar (senha em
 * branco), porque aí não houve servidor nenhum.
 */
export type ResultadoLdap =
  | { ok: true; pessoa: PessoaDoDiretorio; servidor: Servidor }
  | { ok: false; motivo: 'nao-encontrado' | 'ambiguo' | 'senha'; servidor: Servidor | null };

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

/** A conexão aberta e de qual servidor ela é. */
type Ligada = { conexao: ConexaoLdap; servidor: Servidor };

/**
 * Um servidor só: abrir, e se houver conta de serviço, ligar-se como ela.
 *
 * `provar` resolve um detalhe do cliente: a conexão do `ldapts` é
 * preguiçosa, e quem não tem conta de serviço não faz bind nenhum aqui —
 * então abrir "dá certo" mesmo com o servidor fora, e a queda só
 * apareceria na busca, tarde demais para trocar de servidor. Com réplica
 * cadastrada, um bind anônimo faz o papel do `ldap_bind` sem credencial
 * do GLPI: prova que o servidor está de pé antes de escolhê-lo.
 *
 * Fora disso ele fica desligado, de propósito: numa fonte anônima de um
 * servidor só não há escolha a fazer, e exigir bind anônimo quebraria
 * quem hoje busca sem ele.
 */
async function ligarEm(
  fonte: FonteLdap,
  servidor: Servidor,
  senhaDeServico: string | null,
  abrir: (fonte: FonteLdap) => Promise<ConexaoLdap>,
  provar: boolean,
): Promise<ConexaoLdap> {
  let conexao: ConexaoLdap;
  try {
    conexao = await abrir({ ...fonte, ...servidor });
  } catch (e) {
    if (e instanceof ErroDeDiretorio) throw e;
    throw new ErroDeDiretorio(
      `Sem conexão com ${servidor.host}:${servidor.port}: ${(e as Error).message}`,
    );
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
  } else if (provar) {
    try {
      await conexao.bind('', '');
    } catch (e) {
      await conexao.fechar();
      throw new ErroDeDiretorio(
        `O bind anônimo em ${servidor.host}:${servidor.port} falhou: ${(e as Error).message}`,
      );
    }
  }
  return conexao;
}

/**
 * O primeiro servidor que atender: o principal, depois as réplicas.
 *
 * É o `tryToConnectToServer` do GLPI, e a troca acontece **só aqui** —
 * no ato de conectar e de se ligar como conta de serviço. Uma vez
 * ligado, o servidor que atendeu responde a busca e o bind da pessoa:
 * senha errada é resposta, não queda, e procurar outra resposta noutra
 * réplica seria tentar a mesma senha errada três vezes.
 *
 * Falha de credencial da **conta de serviço** também passa para a
 * próxima, de propósito: senha de serviço recém-trocada demora a
 * replicar, e a réplica que ainda tem a antiga recusa enquanto a outra
 * aceita. Custa pouco — credencial recusada volta rápido, sem esperar
 * o tempo de rede.
 *
 * Quando nenhum atende, a mensagem traz o motivo de **cada um**. "O
 * diretório não respondeu" manda o administrador adivinhar qual; a lista
 * mostra na hora se foi o primeiro que caiu ou se os três recusaram a
 * mesma senha de serviço.
 */
async function conectarComoServico(
  fonte: FonteLdap,
  senhaDeServico: string | null,
  abrir: (fonte: FonteLdap) => Promise<ConexaoLdap>,
): Promise<Ligada> {
  const servidores: Servidor[] = [
    { host: fonte.host, port: fonte.port },
    ...fonte.replicas,
  ];

  // Só vale provar o servidor quando há outro para escolher no lugar.
  const provar = servidores.length > 1;

  const recusas: { servidor: Servidor; erro: ErroDeDiretorio }[] = [];

  for (const servidor of servidores) {
    try {
      return { conexao: await ligarEm(fonte, servidor, senhaDeServico, abrir, provar), servidor };
    } catch (e) {
      if (!(e instanceof ErroDeDiretorio)) throw e;
      recusas.push({ servidor, erro: e });
    }
  }

  // Sem réplica, a mensagem é a do único servidor, sem prefixo: dizer o
  // endereço de quem falhou só informa quando havia escolha.
  if (recusas.length === 1) throw recusas[0]!.erro;

  const lista = recusas
    .map(({ servidor, erro }) => `${servidor.host}:${servidor.port} — ${erro.message}`)
    .join(' | ');

  throw new ErroDeDiretorio(`Nenhum dos ${servidores.length} servidores atendeu. ${lista}`);
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
    // Pedido junto com o resto: o `memberOf` vem na mesma entrada, e
    // buscá-lo depois seria uma ida a mais ao diretório por login.
    ...(fonte.grupos.busca === 'OBJETO' ? [] : [fonte.grupos.campoDoUsuario]),
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

/**
 * A regra de correspondência do AD que segue grupo dentro de grupo.
 *
 * `LDAP_MATCHING_RULE_IN_CHAIN`, extensão da Microsoft. Num diretório
 * que não a conhece a busca volta vazia — por isso `aninhados` nasce
 * desligado, e por isso o filtro só a usa quando a casa pediu.
 */
const REGRA_EM_CADEIA = '1.2.840.113556.1.4.1941';

/** Tudo o que o atributo multivalorado tem, não só o primeiro. */
function comoLista(bruto: unknown): string[] {
  const valores = Array.isArray(bruto) ? bruto : [bruto];

  return valores
    .map((v) => (Buffer.isBuffer(v) ? v.toString('utf8') : v))
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Os grupos da pessoa, pelos dois caminhos que o GLPI oferece.
 *
 * O `memberOf` do próprio usuário sai de graça — já veio na entrada que
 * o login buscou. A busca por objeto de grupo custa uma consulta a mais,
 * e é a única que funciona no OpenLDAP com `groupOfNames`, onde não há
 * `memberOf`.
 *
 * Com `AMBOS`, os dois resultados se somam e o DN repetido some: o
 * mesmo grupo encontrado pelos dois caminhos é um grupo só.
 *
 * **Erro aqui sobe.** Quem chama não pode confundir "o diretório caiu"
 * com "a pessoa não está em grupo nenhum" — a segunda tiraria todo mundo
 * dos times na primeira instabilidade de rede.
 */
export async function lerGrupos(
  conexao: ConexaoLdap,
  fonte: FonteLdap,
  entrada: Entrada,
): Promise<string[]> {
  const { grupos: cfg } = fonte;
  const achados = new Set<string>();

  if (cfg.busca === 'ATRIBUTO' || cfg.busca === 'AMBOS') {
    for (const grupo of comoLista(atributo(entrada, cfg.campoDoUsuario))) achados.add(grupo);
  }

  if (cfg.busca === 'OBJETO' || cfg.busca === 'AMBOS') {
    const membro = cfg.aninhados
      ? `(${cfg.campoDoMembro}:${REGRA_EM_CADEIA}:=${escaparFiltro(entrada.dn)})`
      : `(${cfg.campoDoMembro}=${escaparFiltro(entrada.dn)})`;

    const extra = cfg.filtro?.trim();
    const filtro = extra
      ? `(&${membro}${extra.startsWith('(') ? extra : `(${extra})`})`
      : membro;

    let objetos: Entrada[];
    try {
      objetos = await conexao.buscar(cfg.baseDn?.trim() || fonte.baseDn, filtro, ['dn']);
    } catch (e) {
      // Base inexistente é "não há grupos aí", e não queda do diretório.
      if ((e as Error).name === 'NoSuchObjectError') return [...achados];
      throw new ErroDeDiretorio(`O diretório recusou a busca de grupos: ${(e as Error).message}`);
    }

    for (const objeto of objetos) if (objeto.dn) achados.add(objeto.dn.trim());
  }

  return [...achados];
}

function paraPessoa(
  fonte: FonteLdap,
  entrada: Entrada,
  digitado: string,
  grupos: string[],
): PessoaDoDiretorio {
  return {
    dn: entrada.dn,
    grupos,
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
  if (!senha || !login.trim()) return { ok: false, motivo: 'senha', servidor: null };

  const { conexao, servidor } = await conectarComoServico(fonte, senhaDeServico, abrir);
  try {
    const achou = await procurar(conexao, fonte, login);
    if (!achou.ok) return { ...achou, servidor };

    try {
      await conexao.bind(achou.entrada.dn, senha);
    } catch (e) {
      if (e instanceof InvalidCredentialsError) return { ok: false, motivo: 'senha', servidor };
      throw new ErroDeDiretorio(`Falha ao validar a senha no diretório: ${(e as Error).message}`);
    }

    // Depois do bind: antes dele a conta de serviço é quem está ligada, e
    // há diretório que só mostra o `memberOf` para quem se autenticou.
    const grupos = await lerGrupos(conexao, fonte, achou.entrada);

    return { ok: true, pessoa: paraPessoa(fonte, achou.entrada, login, grupos), servidor };
  } finally {
    await conexao.fechar();
  }
}

export type ResultadoDoTeste = {
  ok: boolean;
  mensagem: string;
  /** Presente quando o teste procurou alguém e achou. */
  pessoa?: PessoaDoDiretorio;
  /**
   * Quem atendeu. Ausente quando ninguém atendeu — e aí a mensagem traz o
   * motivo de cada servidor.
   */
  servidor?: Servidor;
};

/**
 * O "Testar" da tela: conexão, conta de serviço, base e, se veio um login,
 * a busca por ele — sem a senha da pessoa, que o administrador não tem.
 * Nunca lança: a resposta vira mensagem na tela.
 *
 * Quando foi uma réplica que atendeu, a mensagem diz isso antes de tudo.
 * Teste verde esconderia a melhor notícia que ele tem para dar: o
 * principal está fora, e só o segundo servidor é que está de pé.
 */
export async function testarFonte(
  fonte: FonteLdap,
  senhaDeServico: string | null,
  login?: string | null,
  abrir: (fonte: FonteLdap) => Promise<ConexaoLdap> = abrirConexao,
): Promise<ResultadoDoTeste> {
  let ligada: Ligada;
  try {
    ligada = await conectarComoServico(fonte, senhaDeServico, abrir);
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  const { conexao, servidor } = ligada;
  const daReplica =
    servidor.host === fonte.host && servidor.port === fonte.port
      ? ''
      : `Quem atendeu foi a réplica ${servidor.host}:${servidor.port} — o servidor principal não respondeu. `;

  try {
    const resultado = await testarLigado(conexao, fonte, login);
    return { ...resultado, servidor, mensagem: daReplica + resultado.mensagem };
  } finally {
    await conexao.fechar();
  }
}

/** O teste de dentro da conexão já aberta. Separado para a mensagem do servidor ser uma só. */
async function testarLigado(
  conexao: ConexaoLdap,
  fonte: FonteLdap,
  login?: string | null,
): Promise<ResultadoDoTeste> {
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
    // O teste lê os grupos de propósito: montar o mapa sem saber como o
    // diretório nomeia os grupos é adivinhar, e adivinhar errado dá um
    // mapa que nunca casa e ninguém sabe por quê.
    //
    // Sem bind como a pessoa, ao contrário do login — aqui não há a
    // senha dela. Diretório que esconde `memberOf` da conta de serviço
    // devolve lista vazia, e a mensagem diz isso.
    const grupos = await lerGrupos(conexao, fonte, achou.entrada);
    const pessoa = paraPessoa(fonte, achou.entrada, login, grupos);

    const semId = pessoa.externalId
      ? ''
      : `, mas sem ${fonte.syncField}: o vínculo vai depender só do login`;

    const comGrupos =
      grupos.length > 0
        ? ` ${grupos.length} grupo(s): ${grupos.slice(0, 5).join('; ')}${grupos.length > 5 ? '; …' : ''}`
        : ' Nenhum grupo — confira a busca de grupos, ou se a conta de serviço enxerga o atributo.';

    return {
      ok: true,
      mensagem: `Encontrada: ${pessoa.dn}${semId}.${comGrupos}`,
      pessoa,
    };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}
