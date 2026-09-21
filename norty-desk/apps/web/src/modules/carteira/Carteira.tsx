import { useCallback, useEffect, useState } from 'react';
import { DIGITOS_DO_PIN, loginDoCliente, pinFraco, type ClienteDetail, type ClienteView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarCliente,
  definirPin,
  desativarCliente,
  incluirPessoa,
  listarClientes,
  obterCliente,
  tirarPessoa,
} from '../../api/carteira';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * A carteira de clientes da Norty.
 *
 * Duas telas em uma: a lista de empresas e, dentro de cada uma, as
 * pessoas que abrem chamado por ela.
 *
 * O login **não** se digita: sai do nome mais o domínio da empresa
 * (`Yuri Souza Goes` + `empresadojoao.com.br` → `yuri.goes@…`). Pedir o
 * login à mão seria pedir a quem cadastra que acerte a mesma regra cem
 * vezes. A tela mostra o login que vai sair enquanto a pessoa digita o
 * nome, com a mesma função que a API usa — nenhuma surpresa ao salvar.
 */
export function Carteira() {
  const { can } = useAutenticacao();
  const [clientes, setClientes] = useState<ClienteView[] | null>(null);
  const [aberto, setAberto] = useState<ClienteDetail | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setClientes(await listarClientes());
  }, []);

  useEffect(() => {
    void recarregar().catch((e: Error) => setErro(e.message));
  }, [recarregar]);

  const podeGerenciar = can('cliente:gerenciar');

  async function tentar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir a ação.');
    }
  }

  return (
    <div className="pilha">
      <div className="linha-entre">
        <div>
          <h2 style={{ fontSize: 'var(--t-h3)' }}>Carteira de clientes</h2>
          <p className="campo-ajuda">As empresas que a Norty atende, e quem abre chamado nelas.</p>
        </div>
        {podeGerenciar ? (
          <button type="button" className="btn -primario" onClick={() => setNovo(true)}>
            Nova empresa
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="status">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      <section className="card">
        <div className="card-corpo">
          {!clientes ? (
            <div className="sk sk-bloco" />
          ) : clientes.length === 0 ? (
            <p className="campo-ajuda">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Domínio</th>
                  <th className="-num">Pessoas</th>
                  <th className="-num">Chamados abertos</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td className="tabela-titulo-celula">{c.name}</td>
                    <td className="mono">{c.emailDomain}</td>
                    <td className="-num">{c.peopleCount}</td>
                    <td className="-num">{c.openTickets}</td>
                    <td>
                      <span className={`selo ${c.isActive ? '-sucesso' : '-neutro'}`}>
                        {c.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => void obterCliente(c.id).then(setAberto)}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {novo ? (
        <FormaDaEmpresa
          aoFechar={() => setNovo(false)}
          aoSalvar={async (dados) => {
            const criado = await criarCliente(dados);
            await recarregar();
            setNovo(false);
            setAberto(criado);
          }}
        />
      ) : null}

      {aberto ? (
        <Empresa
          cliente={aberto}
          podeGerenciar={podeGerenciar}
          aoFechar={() => setAberto(null)}
          aoMudar={async (atualizado) => {
            setAberto(atualizado);
            await recarregar();
          }}
          aoErrar={(m) => setErro(m)}
          aoTentar={tentar}
        />
      ) : null}
    </div>
  );
}

function FormaDaEmpresa({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    emailDomain: string;
    document?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  }) => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [dominio, setDominio] = useState('');
  const [documento, setDocumento] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Nova empresa"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h3 className="card-titulo">Nova empresa</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setOcupado(true);
            void aoSalvar({
              name: nome.trim(),
              emailDomain: dominio.trim(),
              document: documento.trim() || null,
              contactEmail: email.trim() || null,
              contactPhone: telefone.trim() || null,
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
              )
              .finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo">
              <label className="campo-rotulo" htmlFor="nome-empresa">Razão social ou nome</label>
              <input id="nome-empresa" className="input" required minLength={2}
                value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="dominio-empresa">Domínio do e-mail</label>
              <input id="dominio-empresa" className="input" required minLength={4}
                placeholder="empresadojoao.com.br"
                value={dominio} onChange={(e) => setDominio(e.target.value)} />
              {/* O domínio é a peça que decide o login de todo mundo da
                  empresa; errá-lo aqui erra o login de cem pessoas. */}
              <span className="campo-ajuda">
                É dele que sai o login de cada pessoa. Depois que alguém tiver login, ele não
                muda mais.
              </span>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="doc-empresa">CNPJ ou CPF</label>
                <input id="doc-empresa" className="input" value={documento}
                  onChange={(e) => setDocumento(e.target.value)} />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tel-empresa">Telefone</label>
                <input id="tel-empresa" className="input" value={telefone}
                  onChange={(e) => setTelefone(e.target.value)} />
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="email-empresa">E-mail de contato</label>
              <input id="email-empresa" className="input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -secundario" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="btn -primario" disabled={ocupado || !nome || !dominio}>
              {ocupado ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Empresa({
  cliente,
  podeGerenciar,
  aoFechar,
  aoMudar,
  aoErrar,
  aoTentar,
}: {
  cliente: ClienteDetail;
  podeGerenciar: boolean;
  aoFechar: () => void;
  aoMudar: (c: ClienteDetail) => Promise<void>;
  aoErrar: (m: string) => void;
  aoTentar: (acao: () => Promise<unknown>) => Promise<void>;
}) {
  const [nomeNovo, setNomeNovo] = useState('');
  const [emailNovo, setEmailNovo] = useState('');
  const [telNovo, setTelNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // O login que vai sair, calculado com a mesma função da API. Mostrado
  // enquanto a pessoa digita: ninguém descobre o próprio login depois
  // de salvar.
  const loginPrevisto = nomeNovo.trim() ? loginDoCliente(nomeNovo, cliente.emailDomain) : null;

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div className="modal -lg" role="dialog" aria-modal="true" aria-label={cliente.name}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <div>
            <h3 className="card-titulo">{cliente.name}</h3>
            <p className="card-sub mono">{cliente.emailDomain}</p>
          </div>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>×</button>
        </div>

        <div className="modal-corpo pilha">
          <h4 className="card-titulo" style={{ fontSize: 'var(--t-corpo)' }}>
            Quem abre chamado ({cliente.people.length})
          </h4>

          {cliente.people.length === 0 ? (
            <p className="campo-ajuda">Ninguém cadastrado ainda.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  <th>Acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cliente.people.map((p) => (
                  <tr key={p.id}>
                    <td className="tabela-titulo-celula">{p.name}</td>
                    <td className="mono">{p.login}</td>
                    <td>
                      <span className={`selo ${p.pinPendente ? '-aviso' : '-sucesso'}`}>
                        {p.pinPendente ? 'PIN pendente' : 'Ativo'}
                      </span>
                    </td>
                    <td className="-num">
                      {podeGerenciar ? (
                        <div className="linha" style={{ gap: 'var(--e-2)', justifyContent: 'flex-end' }}>
                          <DefinirPin
                            onDefinir={(pin) =>
                              definirPin(cliente.id, p.id, pin).then(() =>
                                obterCliente(cliente.id).then(aoMudar),
                              )
                            }
                            aoErrar={aoErrar}
                          />
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() =>
                              void aoTentar(() =>
                                tirarPessoa(cliente.id, p.id).then(aoMudar),
                              )
                            }
                          >
                            Tirar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {podeGerenciar ? (
            <form
              className="pilha-sm"
              onSubmit={(e) => {
                e.preventDefault();
                setOcupado(true);
                void incluirPessoa(cliente.id, {
                  name: nomeNovo.trim(),
                  contactEmail: emailNovo.trim() || null,
                  phone: telNovo.trim() || null,
                })
                  .then(async (atualizado) => {
                    setNomeNovo('');
                    setEmailNovo('');
                    setTelNovo('');
                    await aoMudar(atualizado);
                  })
                  .catch((e2: unknown) =>
                    aoErrar(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível incluir.'),
                  )
                  .finally(() => setOcupado(false));
              }}
            >
              <div className="campo">
                <label className="campo-rotulo" htmlFor="nome-pessoa">Nome completo</label>
                <input id="nome-pessoa" className="input" required minLength={3}
                  placeholder="Yuri Souza Goes"
                  value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
                <span className="campo-ajuda">
                  {loginPrevisto
                    ? <>O login será <strong className="mono">{loginPrevisto}</strong>.</>
                    : 'O login sai do nome mais o domínio da empresa.'}
                </span>
              </div>

              <div className="campo-grupo">
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="email-pessoa">E-mail de contato</label>
                  <input id="email-pessoa" className="input" type="email"
                    value={emailNovo} onChange={(e) => setEmailNovo(e.target.value)} />
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="tel-pessoa">WhatsApp</label>
                  <input id="tel-pessoa" className="input"
                    value={telNovo} onChange={(e) => setTelNovo(e.target.value)} />
                </div>
              </div>

              <button type="submit" className="btn -secundario" disabled={ocupado || !nomeNovo.trim()}>
                Incluir pessoa
              </button>
            </form>
          ) : null}
        </div>

        <div className="modal-rodape">
          {podeGerenciar ? (
            <button
              type="button"
              className="btn -fantasma"
              onClick={() => void aoTentar(() => desativarCliente(cliente.id).then(aoFechar))}
            >
              Desativar empresa
            </button>
          ) : null}
          <button type="button" className="btn -secundario" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * O PIN de seis dígitos.
 *
 * Quem gerencia a carteira define o primeiro, para entregar à pessoa; a
 * pessoa troca depois. `pinFraco` é a mesma regra da API — `123456` e
 * `111111` são recusados aqui e lá, e recusá-los só do lado do servidor
 * faria a tela parecer quebrada.
 */
function DefinirPin({
  onDefinir,
  aoErrar,
}: {
  onDefinir: (pin: string) => Promise<unknown>;
  aoErrar: (m: string) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [pin, setPin] = useState('');

  const problema = pin ? pinFraco(pin) : null;

  if (!abrindo) {
    return (
      <button type="button" className="btn -fantasma -sm" onClick={() => setAbrindo(true)}>
        Definir PIN
      </button>
    );
  }

  return (
    <span className="linha" style={{ gap: 'var(--e-2)' }}>
      <input
        className="input"
        style={{ width: 110, fontFamily: 'ui-monospace, monospace', letterSpacing: '.18em' }}
        inputMode="numeric"
        maxLength={DIGITOS_DO_PIN}
        value={pin}
        aria-label="PIN de seis dígitos"
        aria-invalid={Boolean(problema)}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
      />
      <button
        type="button"
        className="btn -secundario -sm"
        disabled={pin.length !== DIGITOS_DO_PIN || Boolean(problema)}
        title={problema ?? undefined}
        onClick={() => {
          void onDefinir(pin)
            .then(() => {
              setPin('');
              setAbrindo(false);
            })
            .catch((e: unknown) =>
              aoErrar(e instanceof ErroDaApi ? e.message : 'Não foi possível definir o PIN.'),
            );
        }}
      >
        Salvar
      </button>
    </span>
  );
}
