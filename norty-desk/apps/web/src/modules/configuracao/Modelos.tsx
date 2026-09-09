import { useCallback, useEffect, useState } from 'react';
import type { ModeloView, TemplateKind } from '@norty-desk/shared';
import {
  CAMPOS_DO_MODELO,
  ROTULO_MODELO,
  TEMPLATE_KINDS,
  marcadoresInvalidos,
  preencherModelo,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { listarCategorias, type CategoriaView } from '../../api/endpoints';
import { criarModelo, editarModelo, listarModelos, removerModelo } from '../../api/modelos';

/**
 * Modelos de resposta, solução e tarefa.
 *
 * Uma tela para os três. O GLPI tem três telas, três buscas e três
 * CRUDs para a mesma coisa — um texto pronto — só porque ela é usada em
 * três lugares.
 */
export function Modelos() {
  const [kind, setKind] = useState<TemplateKind>('RESPOSTA');
  const [modelos, setModelos] = useState<ModeloView[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<ModeloView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setModelos(await listarModelos({ kind, incluirInativos: true }));
  }, [kind]);

  useEffect(() => {
    setModelos(null);
    void recarregar().catch(() => setErro('Não foi possível carregar os modelos.'));
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Modelos</h2>
          <p>
            Textos prontos para resposta, solução e tarefa. A lista que o atendimento vê é
            ordenada pelo mais usado e filtrada pela categoria do chamado.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
          Novo modelo
        </button>
      </div>

      <div className="linha" style={{ gap: 'var(--e-2)' }}>
        {TEMPLATE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn -sm ${k === kind ? '-primario' : '-secundario'}`}
            onClick={() => setKind(k)}
          >
            {ROTULO_MODELO[k]}
          </button>
        ))}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!modelos ? (
        <div className="sk sk-bloco" />
      ) : modelos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum modelo de {ROTULO_MODELO[kind].toLowerCase()}</h3>
          <p>
            A frase que o atendimento escreve toda semana — “já estamos olhando”, “precisamos do
            número do patrimônio” — cabe aqui e passa a custar um clique.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Categoria</th>
                  <th className="-num">Usos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {modelos.map((m) => (
                  <tr key={m.id} style={m.isActive ? undefined : { opacity: 0.55 }}>
                    <td className="tabela-titulo-celula">
                      {m.name}
                      {m.isInternal ? (
                        <span className="selo -neutro" style={{ marginLeft: 'var(--e-2)' }}>
                          nota interna
                        </span>
                      ) : null}
                      {!m.isActive ? (
                        <span className="selo -neutro" style={{ marginLeft: 'var(--e-2)' }}>
                          desligado
                        </span>
                      ) : null}
                      <span className="campo-ajuda" style={{ display: 'block' }}>
                        {m.body.slice(0, 90)}
                        {m.body.length > 90 ? '…' : ''}
                      </span>
                    </td>
                    <td>{m.category?.name ?? 'Qualquer'}</td>
                    <td className="-num">{m.usageCount}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(m)}
                      >
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

      {emEdicao ? (
        <Formulario
          modelo={emEdicao === 'novo' ? null : emEdicao}
          kindPadrao={kind}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') await criarModelo(dados);
            else await editarModelo(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
          aoRemover={
            emEdicao === 'novo'
              ? undefined
              : async () => {
                  await removerModelo(emEdicao.id);
                  setEmEdicao(null);
                  await recarregar();
                }
          }
        />
      ) : null}
    </div>
  );
}

/** Um chamado de mentira para a prévia — a mesma função que a tela do chamado usa. */
const EXEMPLO = {
  'chamado.numero': '1042',
  'chamado.assunto': 'Impressora do quarto andar travada',
  'chamado.categoria': 'Hardware',
  'requerente.nome': 'Marina Alves',
  'requerente.email': 'marina@empresa.com.br',
  'agente.nome': 'Joana Ribeiro',
  'organizacao.nome': 'Norty',
};

function Formulario({
  modelo,
  kindPadrao,
  aoFechar,
  aoSalvar,
  aoRemover,
}: {
  modelo: ModeloView | null;
  kindPadrao: TemplateKind;
  aoFechar: () => void;
  aoSalvar: (dados: {
    kind: TemplateKind;
    name: string;
    body: string;
    categoryId?: string | null;
    isInternal?: boolean;
    isActive?: boolean;
  }) => Promise<void>;
  aoRemover?: () => Promise<void>;
}) {
  const [kind, setKind] = useState<TemplateKind>(modelo?.kind ?? kindPadrao);
  const [name, setName] = useState(modelo?.name ?? '');
  const [body, setBody] = useState(modelo?.body ?? '');
  const [categoryId, setCategoryId] = useState(modelo?.category?.id ?? '');
  const [isInternal, setIsInternal] = useState(modelo?.isInternal ?? false);
  const [isActive, setIsActive] = useState(modelo?.isActive ?? true);
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarCategorias()
      .then(setCategorias)
      .catch(() => undefined);
  }, []);

  const invalidos = marcadoresInvalidos(body);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal -lg"
        role="dialog"
        aria-modal="true"
        aria-label={modelo ? 'Editar modelo' : 'Novo modelo'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{modelo ? 'Editar modelo' : 'Novo modelo'}</h3>
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
              kind,
              name,
              body,
              categoryId: categoryId || null,
              isInternal: kind === 'RESPOSTA' ? isInternal : false,
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

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-modelo">
                  Tipo
                </label>
                <select
                  id="tipo-modelo"
                  className="select"
                  value={kind}
                  disabled={Boolean(modelo)}
                  onChange={(e) => setKind(e.target.value as TemplateKind)}
                >
                  {TEMPLATE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ROTULO_MODELO[k]}
                    </option>
                  ))}
                </select>
                {modelo ? (
                  <span className="campo-ajuda">
                    O tipo não muda depois: ele decide onde o modelo aparece.
                  </span>
                ) : null}
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="nome-modelo">
                  Nome
                </label>
                <input
                  id="nome-modelo"
                  className="input"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="corpo-modelo">
                Texto
              </label>
              <textarea
                id="corpo-modelo"
                className="textarea"
                rows={6}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <span className="campo-ajuda">
                Marcadores: {CAMPOS_DO_MODELO.map((c) => `{{${c}}}`).join(', ')}
              </span>
            </div>

            {invalidos.length > 0 ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>
                  Estes marcadores não existem: {invalidos.map((m) => `{{${m}}}`).join(', ')}. Sairiam
                  assim mesmo na resposta ao cliente.
                </span>
              </div>
            ) : null}

            {body.trim() ? (
              <>
                <div className="divisor-texto">
                  <span>Prévia</span>
                </div>
                <p className="conversa-corpo">{preencherModelo(body, EXEMPLO)}</p>
              </>
            ) : null}

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="categoria-modelo">
                  Categoria
                </label>
                <select
                  id="categoria-modelo"
                  className="select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Qualquer categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="campo-ajuda">
                  Limitar à categoria é o que evita a lista de sessenta modelos.
                </span>
              </div>

              <div className="campo pilha-sm">
                {kind === 'RESPOSTA' ? (
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    <span className="switch-trilho" aria-hidden="true">
                      <span className="switch-bolinha" />
                    </span>
                    <span>Entra como nota interna</span>
                  </label>
                ) : null}

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span className="switch-trilho" aria-hidden="true">
                    <span className="switch-bolinha" />
                  </span>
                  <span>Ativo</span>
                </label>
              </div>
            </div>
          </div>

          <div className="modal-rodape linha-entre">
            {aoRemover ? (
              <button
                type="button"
                className="btn -perigo -sm"
                disabled={ocupado}
                onClick={() => {
                  setOcupado(true);
                  void aoRemover()
                    .catch((e: unknown) =>
                      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível apagar.'),
                    )
                    .finally(() => setOcupado(false));
                }}
              >
                Apagar
              </button>
            ) : (
              <span />
            )}
            <span className="linha" style={{ gap: 'var(--e-2)' }}>
              <button type="button" className="btn -fantasma" onClick={aoFechar}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn -primario"
                disabled={ocupado || invalidos.length > 0}
              >
                Salvar
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
