import { useCallback, useEffect, useState } from 'react';
import type { TimeView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import {
  criarTime,
  editarTime,
  incluirNoTime,
  listarTimes,
  tirarDoTime,
} from '../../api/times';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * Times e quem está neles.
 *
 * Duas telas em uma, como a carteira: a lista de times e, dentro de
 * cada um, as pessoas. Separar em duas faria "criar o time" e "botar
 * gente nele" virarem duas viagens, e time vazio não recebe chamado.
 *
 * O selo de **gestor** é do time, não o papel GESTOR da matriz RBAC:
 * aquele diz o que a pessoa pode fazer no sistema, este diz de quem
 * ela responde. É para o gestor do time que o escalonamento sobe.
 */
export function Times() {
  const { can } = useAutenticacao();
  const [times, setTimes] = useState<TimeView[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<TimeView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const podeGerenciar = can('time:gerenciar');

  const recarregar = useCallback(async () => {
    setTimes(await listarTimes());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os times.'));
    void listarPessoas()
      .then(setPessoas)
      .catch(() => undefined);
  }, [recarregar]);

  async function tentar(acao: () => Promise<TimeView[]>) {
    setErro(null);
    try {
      setTimes(await acao());
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <div className="pilha" style={{ maxWidth: 960 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Times</h2>
          <p>
            Quem atende junto. O time recebe o chamado pela categoria ou pelo modelo, e todo mundo
            que está nele enxerga a fila — atribuir a uma pessoa vem depois, se vier.
          </p>
        </div>
        {podeGerenciar ? (
          <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
            Novo time
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!times ? (
        <div className="sk sk-bloco" />
      ) : times.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum time</h3>
          <p>
            Sem time, todo chamado nasce sem dono e alguém precisa distribuir à mão. Um time por
            frente de atendimento — “Suporte”, “Infraestrutura” — já resolve.
          </p>
        </div>
      ) : (
        <div className="pilha-sm">
          {times.map((time) => (
            <Ficha
              key={time.id}
              time={time}
              pessoas={pessoas}
              aberto={aberto === time.id}
              podeGerenciar={podeGerenciar}
              aoAbrir={() => setAberto((a) => (a === time.id ? null : time.id))}
              aoEditar={() => setEmEdicao(time)}
              aoIncluir={(userId, gestor) => tentar(() => incluirNoTime(time.id, userId, gestor))}
              aoTirar={(userId) => tentar(() => tirarDoTime(time.id, userId))}
            />
          ))}
        </div>
      )}

      {emEdicao ? (
        <Formulario
          time={emEdicao === 'novo' ? null : emEdicao}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') setTimes(await criarTime(dados));
            else setTimes(await editarTime(emEdicao.id, dados));
            setEmEdicao(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Ficha({
  time,
  pessoas,
  aberto,
  podeGerenciar,
  aoAbrir,
  aoEditar,
  aoIncluir,
  aoTirar,
}: {
  time: TimeView;
  pessoas: PessoaView[];
  aberto: boolean;
  podeGerenciar: boolean;
  aoAbrir: () => void;
  aoEditar: () => void;
  aoIncluir: (userId: string, gestor: boolean) => void;
  aoTirar: (userId: string) => void;
}) {
  const [escolhida, setEscolhida] = useState('');
  const [comoGestor, setComoGestor] = useState(false);

  const deFora = pessoas.filter((p) => !time.members.some((m) => m.id === p.id));

  return (
    <div className="card">
      <div className="linha-entre" style={{ alignItems: 'flex-start' }}>
        <div>
          <button type="button" className="btn-link" onClick={aoAbrir} aria-expanded={aberto}>
            <span className="card-titulo">{time.name}</span>
          </button>
          <span className="campo-ajuda" style={{ display: 'block' }}>
            {time.description ? `${time.description} · ` : ''}
            {time.members.length === 0
              ? 'ninguém dentro'
              : `${time.members.length} ${time.members.length === 1 ? 'pessoa' : 'pessoas'}`}
            {time.email ? ` · ${time.email}` : ''}
          </span>
        </div>
        <span className="linha" style={{ gap: 'var(--e-2)' }}>
          {!time.isActive ? <span className="selo -neutro">inativo</span> : null}
          {podeGerenciar ? (
            <button type="button" className="btn -fantasma -sm" onClick={aoEditar}>
              Editar
            </button>
          ) : null}
        </span>
      </div>

      {aberto ? (
        <div className="pilha-sm" style={{ marginTop: 'var(--e-4)' }}>
          {time.members.length === 0 ? (
            <p className="campo-ajuda">
              Time vazio não recebe chamado: a fila dele fica sem ninguém olhando.
            </p>
          ) : null}

          {time.members.map((m) => (
            <div key={m.id} className="linha-entre" style={{ flexWrap: 'nowrap' }}>
              <span style={{ minWidth: 0 }}>
                {m.name}
                {m.isManager ? (
                  <span className="selo -info" style={{ marginLeft: 'var(--e-2)' }}>
                    gestor do time
                  </span>
                ) : null}
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {m.email ?? 'sem e-mail'}
                </span>
              </span>
              {podeGerenciar ? (
                <span className="linha" style={{ gap: 'var(--e-2)' }}>
                  <button
                    type="button"
                    className="btn -fantasma -sm"
                    onClick={() => aoIncluir(m.id, !m.isManager)}
                  >
                    {m.isManager ? 'tirar de gestor' : 'tornar gestor'}
                  </button>
                  <button
                    type="button"
                    className="btn-icone"
                    aria-label={`Tirar ${m.name} do time`}
                    onClick={() => aoTirar(m.id)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </div>
          ))}

          {podeGerenciar ? (
            <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
              <select
                className="select"
                style={{ maxWidth: 280 }}
                aria-label={`Incluir pessoa em ${time.name}`}
                value={escolhida}
                onChange={(e) => setEscolhida(e.target.value)}
              >
                <option value="">Incluir alguém…</option>
                {deFora.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <label className="check">
                <input
                  type="checkbox"
                  checked={comoGestor}
                  onChange={(e) => setComoGestor(e.target.checked)}
                />
                <span>como gestor</span>
              </label>
              <button
                type="button"
                className="btn -secundario -sm"
                disabled={!escolhida}
                onClick={() => {
                  aoIncluir(escolhida, comoGestor);
                  setEscolhida('');
                  setComoGestor(false);
                }}
              >
                Incluir
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Formulario({
  time,
  aoFechar,
  aoSalvar,
}: {
  time: TimeView | null;
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    description: string | null;
    email: string | null;
    isActive: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(time?.name ?? '');
  const [description, setDescription] = useState(time?.description ?? '');
  const [email, setEmail] = useState(time?.email ?? '');
  const [isActive, setIsActive] = useState(time?.isActive ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={time ? 'Editar time' : 'Novo time'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{time ? 'Editar time' : 'Novo time'}</h3>
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
              name: name.trim(),
              description: description.trim() || null,
              email: email.trim() || null,
              isActive,
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
              <label className="campo-rotulo" htmlFor="nome-time">
                Nome
              </label>
              <input
                id="nome-time"
                className="input"
                required
                minLength={2}
                placeholder="Suporte"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="descricao-time">
                Descrição (opcional)
              </label>
              <input
                id="descricao-time"
                className="input"
                placeholder="Primeiro atendimento, estação de trabalho e impressão"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="email-time">
                E-mail da fila (opcional)
              </label>
              <input
                id="email-time"
                className="input"
                type="email"
                placeholder="suporte@norty.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="campo-ajuda">
                Vira o remetente das respostas deste time. Sem ele, sai o endereço da organização.
              </span>
            </div>

            {time ? (
              <>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span className="switch-trilho" aria-hidden="true">
                    <span className="switch-bolinha" />
                  </span>
                  <span>Time ativo</span>
                </label>
                <span className="campo-ajuda">
                  Desativar não apaga: os chamados que já são dele continuam sendo. Ele só deixa de
                  aparecer como destino novo.
                </span>
              </>
            ) : null}
          </div>

          <div className="modal-rodape linha-entre">
            <span />
            <span className="linha" style={{ gap: 'var(--e-2)' }}>
              <button type="button" className="btn -fantasma" onClick={aoFechar}>
                Cancelar
              </button>
              <button type="submit" className="btn -primario" disabled={ocupado}>
                Salvar
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
