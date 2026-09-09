import { useCallback, useEffect, useState } from 'react';
import type { FormField, FormSchema, FormularioView } from '@norty-desk/shared';
import { FORM_FIELD_TYPES, ROTULO_CAMPO, validarSchema } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { listarCategorias, type CategoriaView } from '../../api/endpoints';
import {
  criarFormulario,
  editarFormulario,
  listarFormularios,
  removerFormulario,
} from '../../api/formularios';
import { CamposDinamicos } from '../formulario/CamposDinamicos';

/**
 * Formulários por categoria.
 *
 * Substitui as doze tabelas `tickettemplate*` do GLPI. O montador tem
 * prévia ao lado porque formulário se avalia vendo: a lista de campos
 * diz o que existe, a prévia diz o que a pessoa vai encontrar.
 */
export function Formularios() {
  const [formularios, setFormularios] = useState<FormularioView[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<FormularioView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setFormularios(await listarFormularios());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os formulários.'));
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Formulários</h2>
          <p>
            Os campos que a categoria acrescenta ao chamado. A categoria filha herda o formulário
            da categoria acima; sem nenhum na árvore, vale o formulário padrão da organização.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
          Novo formulário
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!formularios ? (
        <div className="sk sk-bloco" />
      ) : formularios.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum formulário</h3>
          <p>
            Patrimônio, andar, ramal: o que o atendimento sempre precisa perguntar e hoje vem no
            corpo do texto, quando vem.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Formulário</th>
                  <th>Categoria</th>
                  <th className="-num">Campos</th>
                  <th className="-num">Chamados</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {formularios.map((f) => (
                  <tr key={f.id}>
                    <td className="tabela-titulo-celula">
                      {f.name}
                      {f.isDefault ? (
                        <span className="selo -info" style={{ marginLeft: 'var(--e-2)' }}>
                          padrão
                        </span>
                      ) : null}
                    </td>
                    <td>{f.category?.name ?? '—'}</td>
                    <td className="-num">{f.schema.fields.length}</td>
                    <td className="-num">{f.ticketCount}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(f)}
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
        <Montador
          formulario={emEdicao === 'novo' ? null : emEdicao}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') await criarFormulario(dados);
            else await editarFormulario(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
          aoRemover={
            emEdicao === 'novo'
              ? undefined
              : async () => {
                  await removerFormulario(emEdicao.id);
                  setEmEdicao(null);
                  await recarregar();
                }
          }
        />
      ) : null}
    </div>
  );
}

const CAMPO_NOVO: FormField = { key: '', label: '', type: 'TEXTO', required: false };

function Montador({
  formulario,
  aoFechar,
  aoSalvar,
  aoRemover,
}: {
  formulario: FormularioView | null;
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    schema: FormSchema;
    categoryId?: string | null;
    isDefault?: boolean;
  }) => Promise<void>;
  aoRemover?: () => Promise<void>;
}) {
  const [name, setName] = useState(formulario?.name ?? '');
  const [categoryId, setCategoryId] = useState(formulario?.category?.id ?? '');
  const [isDefault, setIsDefault] = useState(formulario?.isDefault ?? false);
  const [fields, setFields] = useState<FormField[]>(formulario?.schema.fields ?? []);
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [previa, setPrevia] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarCategorias()
      .then(setCategorias)
      .catch(() => undefined);
  }, []);

  const schema: FormSchema = { fields };
  const problemas = validarSchema(schema);

  const alterar = (indice: number, mudanca: Partial<FormField>) =>
    setFields((atual) => atual.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)));

  const mover = (indice: number, direcao: -1 | 1) =>
    setFields((atual) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino]!, copia[indice]!];
      return copia;
    });

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal -lg"
        role="dialog"
        aria-modal="true"
        aria-label={formulario ? 'Editar formulário' : 'Novo formulário'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{formulario ? 'Editar formulário' : 'Novo formulário'}</h3>
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
            void aoSalvar({ name, schema, categoryId: categoryId || null, isDefault })
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
                <label className="campo-rotulo" htmlFor="nome-formulario">
                  Nome
                </label>
                <input
                  id="nome-formulario"
                  className="input"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="categoria-formulario">
                  Categoria
                </label>
                <select
                  id="categoria-formulario"
                  className="select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Nenhuma</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <span className="switch-trilho" aria-hidden="true">
                <span className="switch-bolinha" />
              </span>
              <span>Formulário padrão da organização</span>
            </label>
            <span className="campo-ajuda">
              Vale quando a categoria — e nenhuma acima dela — tem formulário próprio. Só um por
              organização: marcar este desmarca o outro.
            </span>

            <div className="divisor-texto">
              <span>Campos</span>
            </div>

            {fields.length === 0 ? (
              <p className="campo-ajuda">
                Nenhum campo ainda. Um formulário vazio é o mesmo que categoria sem formulário.
              </p>
            ) : null}

            {fields.map((campo, indice) => (
              <CampoDoMontador
                key={indice}
                campo={campo}
                primeiro={indice === 0}
                ultimo={indice === fields.length - 1}
                aoMudar={(mudanca) => alterar(indice, mudanca)}
                aoMover={(direcao) => mover(indice, direcao)}
                aoRemover={() => setFields((atual) => atual.filter((_, i) => i !== indice))}
              />
            ))}

            <button
              type="button"
              className="btn -secundario -sm"
              onClick={() => setFields((atual) => [...atual, { ...CAMPO_NOVO }])}
            >
              + Campo
            </button>

            {problemas.length > 0 ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>
                  {problemas.map((p) => `${p.key || '(sem chave)'}: ${p.mensagem}`).join(' ')}
                </span>
              </div>
            ) : null}

            {fields.length > 0 && problemas.length === 0 ? (
              <>
                <div className="divisor-texto">
                  <span>Prévia</span>
                </div>
                <div className="card" style={{ padding: 'var(--e-4)' }}>
                  <CamposDinamicos
                    previa
                    schema={schema}
                    respostas={previa}
                    aoMudar={(chave, valor) => setPrevia((atual) => ({ ...atual, [chave]: valor }))}
                  />
                </div>
              </>
            ) : null}
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
                disabled={ocupado || problemas.length > 0}
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

function CampoDoMontador({
  campo,
  primeiro,
  ultimo,
  aoMudar,
  aoMover,
  aoRemover,
}: {
  campo: FormField;
  primeiro: boolean;
  ultimo: boolean;
  aoMudar: (mudanca: Partial<FormField>) => void;
  aoMover: (direcao: -1 | 1) => void;
  aoRemover: () => void;
}) {
  const ehEscolha = campo.type === 'SELECAO' || campo.type === 'MULTISELECAO';

  return (
    <div className="card" style={{ padding: 'var(--e-4)' }}>
      <div className="campo-grupo">
        <div className="campo">
          <label className="campo-rotulo">Rótulo</label>
          <input
            className="input"
            value={campo.label}
            placeholder="O que a pessoa lê"
            onChange={(e) => {
              const label = e.target.value;
              // A chave nasce do rótulo e para de acompanhar assim que
              // alguém a edita: mudar o rótulo de um formulário já em uso
              // não pode renomear a chave das respostas gravadas.
              aoMudar(campo.key ? { label } : { label, key: chaveDe(label) });
            }}
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo">Tipo</label>
          <select
            className="select"
            value={campo.type}
            onChange={(e) => aoMudar({ type: e.target.value as FormField['type'] })}
          >
            {FORM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {ROTULO_CAMPO[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="campo-grupo">
        <div className="campo">
          <label className="campo-rotulo">Chave</label>
          <input
            className="input mono"
            value={campo.key}
            onChange={(e) => aoMudar({ key: e.target.value })}
          />
          <span className="campo-ajuda">Como a resposta é gravada. Não mude depois de usar.</span>
        </div>

        <div className="campo">
          <label className="campo-rotulo">Ajuda (opcional)</label>
          <input
            className="input"
            value={campo.help ?? ''}
            onChange={(e) => aoMudar({ help: e.target.value || undefined })}
          />
        </div>
      </div>

      {ehEscolha ? (
        <div className="campo">
          <label className="campo-rotulo">Opções</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder={'uma por linha\nterreo = Térreo'}
            value={(campo.options ?? []).map((o) => `${o.value} = ${o.label}`).join('\n')}
            onChange={(e) => aoMudar({ options: opcoesDoTexto(e.target.value) })}
          />
          <span className="campo-ajuda">
            Uma por linha. “valor = rótulo”, ou só o rótulo — o valor vira a versão sem acento.
          </span>
        </div>
      ) : null}

      <div className="linha-entre" style={{ marginTop: 'var(--e-3)' }}>
        <span className="linha" style={{ gap: 'var(--e-3)' }}>
          <label className="check">
            <input
              type="checkbox"
              checked={campo.required}
              onChange={(e) => aoMudar({ required: e.target.checked })}
            />
            <span>Obrigatório</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={campo.internal === true}
              onChange={(e) => aoMudar({ internal: e.target.checked || undefined })}
            />
            <span>Só para quem atende</span>
          </label>
        </span>

        <span className="linha" style={{ gap: 'var(--e-1)' }}>
          <button
            type="button"
            className="btn-icone"
            aria-label="Subir"
            disabled={primeiro}
            onClick={() => aoMover(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-icone"
            aria-label="Descer"
            disabled={ultimo}
            onClick={() => aoMover(1)}
          >
            ↓
          </button>
          <button type="button" className="btn-icone" aria-label="Remover campo" onClick={aoRemover}>
            ×
          </button>
        </span>
      </div>
    </div>
  );
}

/** "Número do patrimônio" → "numero_do_patrimonio". */
function chaveDe(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function opcoesDoTexto(texto: string): { value: string; label: string }[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const [antes, ...resto] = linha.split('=');
      const label = resto.length > 0 ? resto.join('=').trim() : antes!.trim();
      const value = resto.length > 0 ? antes!.trim() : chaveDe(antes!.trim());
      return { value, label };
    });
}
