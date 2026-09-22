import { useCallback, useEffect, useState } from 'react';

import { ErroDaApi } from '../../api/cliente';
import type { ClienteView } from '@norty-desk/shared';
import { listarClientes } from '../../api/carteira';
import {
  criarChave,
  listarChaves,
  revogarChave,
  type ChaveCriada,
  type ChaveView,
} from '../../api/integracoes';
import { dataCurta } from '../../lib/formato';

/**
 * Integrações: as chaves que outros sistemas usam para abrir chamado.
 *
 * O que a tela precisa deixar claro, porque não dá para consertar
 * depois: o valor da chave aparece **uma vez**. O banco guarda o
 * SHA-256, e não há como recuperá-lo — perdido, o caminho é revogar e
 * criar outra.
 *
 * A empresa é o que separa uma chave de integração de um token que abre
 * chamado em nome de qualquer cliente. Amarrada a uma, todo chamado que
 * entra por ela nasce daquela empresa e a pessoa que o sistema de
 * origem informa é cadastrada nela — e nem o corpo da requisição pode
 * dizer o contrário.
 */

/** O que uma chave de integração pode fazer. Não há escopo de administração. */
const ESCOPOS: { valor: string; rotulo: string; ajuda: string }[] = [
  { valor: 'chamado:criar', rotulo: 'Abrir chamado', ajuda: 'O mínimo para integrar.' },
  {
    valor: 'chamado:ler:proprios',
    rotulo: 'Consultar o que abriu',
    ajuda: 'Só os chamados que entraram por esta chave.',
  },
  {
    valor: 'chamado:responder',
    rotulo: 'Responder',
    ajuda: 'Devolver texto para a conversa do chamado.',
  },
  { valor: 'anexo:enviar', rotulo: 'Anexar arquivo', ajuda: 'Print, log, relatório.' },
];

export function Integracoes() {
  const [chaves, setChaves] = useState<ChaveView[] | null>(null);
  const [clientes, setClientes] = useState<ClienteView[]>([]);
  const [criando, setCriando] = useState(false);
  const [recemCriada, setRecemCriada] = useState<ChaveCriada | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setChaves(await listarChaves());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as chaves.'));
    void listarClientes()
      .then(setClientes)
      .catch(() => undefined);
  }, [recarregar]);

  const nomeDaEmpresa = (id: string | null) =>
    id ? (clientes.find((c) => c.id === id)?.name ?? 'empresa removida') : null;

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Integrações</h2>
          <p>
            A chave que outro sistema usa para abrir chamado aqui. Amarrada a uma empresa, o
            chamado nasce dela e a pessoa que o sistema de origem informa é cadastrada nela — o
            chamado sai no nome de quem pediu, não de uma “integração” que ninguém responde.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setCriando(true)}>
          Nova chave
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {recemCriada ? <ChaveNova chave={recemCriada} aoFechar={() => setRecemCriada(null)} /> : null}

      {!chaves ? (
        <div className="sk sk-bloco" />
      ) : chaves.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma chave</h3>
          <p>
            Crie uma por sistema que vai abrir chamado — assim dá para revogar um sem derrubar os
            outros, e o “último uso” diz qual está parado.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Sistema</th>
                  <th>Empresa</th>
                  <th>Pode</th>
                  <th>Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {chaves.map((c) => (
                  <tr key={c.id}>
                    <td className="tabela-titulo-celula">
                      {c.name}
                      <span className="campo-ajuda" style={{ display: 'block' }}>
                        criada em {dataCurta(c.createdAt)}
                      </span>
                    </td>
                    <td>
                      {nomeDaEmpresa(c.clientId) ?? (
                        <span className="campo-ajuda">da casa</span>
                      )}
                    </td>
                    <td>
                      <span className="linha" style={{ gap: 'var(--e-1)', flexWrap: 'wrap' }}>
                        {c.scopes.map((e) => (
                          <span key={e} className="selo -contorno">
                            {ESCOPOS.find((x) => x.valor === e)?.rotulo ?? e}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>
                      {c.revokedAt ? (
                        <span className="selo -neutro">revogada</span>
                      ) : c.lastUsedAt ? (
                        dataCurta(c.lastUsedAt)
                      ) : (
                        <span className="campo-ajuda">nunca usada</span>
                      )}
                    </td>
                    <td className="-num">
                      {c.revokedAt ? null : (
                        <button
                          type="button"
                          className="btn -perigo -sm"
                          onClick={() => {
                            setErro(null);
                            void revogarChave(c.id)
                              .then(recarregar)
                              .catch((e: unknown) =>
                                setErro(
                                  e instanceof ErroDaApi ? e.message : 'Não foi possível revogar.',
                                ),
                              );
                          }}
                        >
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {criando ? (
        <Formulario
          clientes={clientes}
          aoFechar={() => setCriando(false)}
          aoCriar={async (dados) => {
            const nova = await criarChave(dados);
            setCriando(false);
            setRecemCriada(nova);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * O valor da chave, mostrado uma única vez.
 *
 * Fica fora da tabela e fora do modal, aberto na tela, porque fechar
 * sem copiar é o erro que não tem conserto.
 */
function ChaveNova({ chave, aoFechar }: { chave: ChaveCriada; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="alerta-bloco -aviso pilha-sm">
      <div className="linha-entre" style={{ width: '100%' }}>
        <strong>Copie agora: esta chave não aparece de novo.</strong>
        <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
          ×
        </button>
      </div>
      <p className="campo-ajuda">
        O que fica guardado é o resumo criptográfico dela. Perdida, não há como recuperá-la — o
        caminho é revogar esta e criar outra.
      </p>
      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <code className="mono" style={{ wordBreak: 'break-all' }}>
          {chave.chave}
        </code>
        <button
          type="button"
          className="btn -secundario -sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(chave.chave)
              .then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              })
              .catch(() => undefined);
          }}
        >
          {copiado ? 'copiado' : 'copiar'}
        </button>
      </div>
    </div>
  );
}

function Formulario({
  clientes,
  aoFechar,
  aoCriar,
}: {
  clientes: ClienteView[];
  aoFechar: () => void;
  aoCriar: (dados: { name: string; clientId?: string; scopes: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [escopos, setEscopos] = useState<string[]>(['chamado:criar']);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nova chave de integração"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Nova chave</h3>
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
            void aoCriar({
              name: name.trim(),
              ...(clientId ? { clientId } : {}),
              scopes: escopos,
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível criar.'),
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
              <label className="campo-rotulo" htmlFor="nome-chave">
                Qual sistema
              </label>
              <input
                id="nome-chave"
                className="input"
                required
                minLength={2}
                placeholder="ERP da Alfa"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="campo-ajuda">
                Uma chave por sistema: assim dá para revogar um sem derrubar os outros.
              </span>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="empresa-chave">
                Empresa
              </label>
              <select
                id="empresa-chave"
                className="select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Nenhuma — chave da casa</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="campo-ajuda">
                {clientId
                  ? 'Todo chamado desta chave nasce desta empresa, e a pessoa informada é cadastrada nela. Nem o corpo da requisição muda isso.'
                  : 'Sem empresa, o chamado entra como contato genérico — serve para monitoramento, não para gente.'}
              </span>
            </div>

            <div className="campo">
              <span className="campo-rotulo">O que esta chave pode fazer</span>
              <div className="pilha-sm">
                {ESCOPOS.map((e) => (
                  <label key={e.valor} className="check">
                    <input
                      type="checkbox"
                      checked={escopos.includes(e.valor)}
                      onChange={(ev) =>
                        setEscopos((atual) =>
                          ev.target.checked
                            ? [...atual, e.valor]
                            : atual.filter((x) => x !== e.valor),
                        )
                      }
                    />
                    <span>
                      {e.rotulo}
                      <span className="campo-ajuda" style={{ display: 'block' }}>
                        {e.ajuda}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <span className="campo-ajuda">
                Não há escopo de administração: chave é de integração, e a API recusa qualquer
                outro.
              </span>
            </div>
          </div>

          <div className="modal-rodape linha-entre">
            <span />
            <span className="linha" style={{ gap: 'var(--e-2)' }}>
              <button type="button" className="btn -fantasma" onClick={aoFechar}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn -primario"
                disabled={ocupado || escopos.length === 0}
              >
                Criar
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
