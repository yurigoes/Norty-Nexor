import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Role } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarPessoa,
  editarPessoa,
  listarPessoasAdmin,
  type Pessoa,
  type PessoaCriada,
} from '../../api/pessoas';
import { useAutenticacao } from '../../auth/Autenticacao';

const PAPEIS: { valor: Role; rotulo: string }[] = [
  { valor: 'SOLICITANTE', rotulo: 'Solicitante' },
  { valor: 'AGENTE', rotulo: 'Agente' },
  { valor: 'SUPERVISOR', rotulo: 'Supervisor' },
  { valor: 'GESTOR', rotulo: 'Gestor' },
  { valor: 'ADMINISTRADOR', rotulo: 'Administrador' },
];

const rotuloDoPapel = (papel: Role) => PAPEIS.find((p) => p.valor === papel)?.rotulo ?? papel;

type Edicao = {
  id: string | null;
  email: string;
  name: string;
  phone: string;
  username: string;
  role: Role;
  isActive: boolean;
  /** Como estava ao abrir: perfil e situação só vão no pedido se mudarem. */
  original: { role: Role; isActive: boolean } | null;
};

const NOVA: Edicao = {
  id: null,
  email: '',
  name: '',
  phone: '',
  username: '',
  role: 'SOLICITANTE',
  isActive: true,
  original: null,
};

/**
 * Pessoas da organização.
 *
 * A API de criar e editar existia havia tempo; faltava a tela, e sem ela
 * a única forma de dar acesso a alguém era por script no servidor.
 *
 * Perfil e situação só entram no pedido quando mudam: a API exige que
 * sobre outro administrador sempre que um dos dois vem, e mandá-los sem
 * mudança impedia o único administrador de corrigir o próprio telefone.
 */
export function Pessoas() {
  const { perfil } = useAutenticacao();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [busca, setBusca] = useState('');
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [criada, setCriada] = useState<PessoaCriada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(async (q?: string) => {
    setPessoas(await listarPessoasAdmin(q));
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as pessoas.'));
  }, [recarregar]);

  function abrir(pessoa: Pessoa | null) {
    setErro(null);
    setCriada(null);
    setEdicao(
      pessoa
        ? {
            id: pessoa.id,
            email: pessoa.email ?? '',
            name: pessoa.name,
            phone: pessoa.phone ?? '',
            username: pessoa.username ?? '',
            role: pessoa.role,
            isActive: pessoa.isActive,
            original: { role: pessoa.role, isActive: pessoa.isActive },
          }
        : NOVA,
    );
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao) return;
    setErro(null);
    setEnviando(true);

    try {
      if (edicao.id && edicao.original) {
        await editarPessoa(edicao.id, {
          name: edicao.name.trim(),
          phone: edicao.phone.trim(),
          username: edicao.username.trim() || null,
          ...(edicao.role !== edicao.original.role ? { role: edicao.role } : {}),
          ...(edicao.isActive !== edicao.original.isActive ? { isActive: edicao.isActive } : {}),
        });
      } else {
        setCriada(
          await criarPessoa({
            ...(edicao.email.trim() ? { email: edicao.email.trim() } : {}),
            name: edicao.name.trim(),
            role: edicao.role,
            ...(edicao.phone.trim() ? { phone: edicao.phone.trim() } : {}),
            ...(edicao.username.trim() ? { username: edicao.username.trim() } : {}),
          }),
        );
      }
      setEdicao(null);
      await recarregar(busca.trim() || undefined);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setEnviando(false);
    }
  }

  const editandoASiMesmo = edicao?.id === perfil?.user.id;

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Pessoas</h2>
          <p>Quem acessa o Norty Desk nesta organização, com que perfil e com que login.</p>
        </div>
        <button type="button" className="btn -primario" onClick={() => abrir(null)}>
          Nova pessoa
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {criada ? (
        <div className="alerta-bloco" role="status">
          <span>
            {criada.senhaProvisoria ? (
              <>
                {criada.name} foi criado(a). Senha provisória:{' '}
                <code style={{ userSelect: 'all' }}>{criada.senhaProvisoria}</code> — ela aparece só
                agora, e a troca é exigida no primeiro acesso.
              </>
            ) : (
              <>{criada.name} já tinha conta noutra organização e foi vinculado(a) sem mudar a senha.</>
            )}
          </span>
          <button type="button" className="btn -fantasma -sm" onClick={() => setCriada(null)}>
            Entendi
          </button>
        </div>
      ) : null}

      {edicao ? (
        <form className="pilha-sm" onSubmit={salvar} noValidate>
          <h3>{edicao.id ? `Editar ${edicao.name}` : 'Nova pessoa'}</h3>

          {edicao.id ? null : (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="pessoa-email">
                E-mail (opcional se houver nome de usuário)
              </label>
              <input
                id="pessoa-email"
                className="input"
                type="email"
                value={edicao.email}
                onChange={(e) => setEdicao({ ...edicao, email: e.target.value })}
              />
            </div>
          )}
          <div className="campo">
            <label className="campo-rotulo" htmlFor="pessoa-nome">
              Nome
            </label>
            <input
              id="pessoa-nome"
              className="input"
              required
              minLength={2}
              value={edicao.name}
              onChange={(e) => setEdicao({ ...edicao, name: e.target.value })}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="pessoa-usuario">
              Nome de usuário (opcional)
            </label>
            <input
              id="pessoa-usuario"
              className="input"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nome.sobrenome"
              value={edicao.username}
              onChange={(e) => setEdicao({ ...edicao, username: e.target.value })}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="pessoa-telefone">
              Telefone
            </label>
            <input
              id="pessoa-telefone"
              className="input"
              type="tel"
              value={edicao.phone}
              onChange={(e) => setEdicao({ ...edicao, phone: e.target.value })}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="pessoa-perfil">
              Perfil
            </label>
            <select
              id="pessoa-perfil"
              className="input"
              value={edicao.role}
              disabled={editandoASiMesmo}
              onChange={(e) => setEdicao({ ...edicao, role: e.target.value as Role })}
            >
              {PAPEIS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
            {editandoASiMesmo ? (
              <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
                Ninguém altera o próprio perfil — peça a outro administrador.
              </span>
            ) : null}
          </div>
          {edicao.id && !editandoASiMesmo ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={edicao.isActive}
                onChange={(e) => setEdicao({ ...edicao, isActive: e.target.checked })}
              />
              Acesso ativo
            </label>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" className="btn -fantasma" onClick={() => setEdicao(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="campo"
        onSubmit={(e) => {
          e.preventDefault();
          void recarregar(busca.trim() || undefined).catch(() => setErro('Não foi possível buscar.'));
        }}
      >
        <input
          className="input"
          type="search"
          placeholder="Buscar por nome, e-mail ou usuário"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </form>

      {!pessoas ? (
        <div className="sk sk-bloco" />
      ) : pessoas.length === 0 ? (
        <div className="vazio">
          <h3>Ninguém encontrado</h3>
          <p>Ajuste a busca ou cadastre a primeira pessoa.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  <th>Perfil</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.id}>
                    <td className="tabela-titulo-celula">{p.name}</td>
                    <td>
                      {p.email ?? <span className="suave">sem e-mail</span>}
                      {p.username ? <span className="suave"> · {p.username}</span> : null}
                      {p.authSourceName ? (
                        <span className="suave"> · AD {p.authSourceName}</span>
                      ) : null}
                    </td>
                    <td>{rotuloDoPapel(p.role)}</td>
                    <td>
                      <span className={`selo ${p.isActive ? '-sucesso' : '-neutro'}`}>
                        {!p.isActive ? 'Inativa' : p.mustChangePassword ? 'Troca de senha pendente' : 'Ativa'}
                      </span>
                    </td>
                    <td className="-num">
                      <button type="button" className="btn -fantasma -sm" onClick={() => abrir(p)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
