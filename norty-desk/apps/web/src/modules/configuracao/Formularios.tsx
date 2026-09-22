import { useCallback, useEffect, useState } from 'react';
import type { FormField, FormSchema, FormularioView, TimeView } from '@norty-desk/shared';
import { FORM_FIELD_TYPES, ROTULO_CAMPO, validarSchema } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { listarCategorias, type CategoriaView } from '../../api/endpoints';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { listarTimes } from '../../api/times';
import {
  criarFormulario,
  editarFormulario,
  listarFormularios,
  removerFormulario,
} from '../../api/formularios';
import { CamposDinamicos } from '../formulario/CamposDinamicos';

/**
 * Modelos de chamado.
 *
 * Uma ficha só, com dois papéis. **Deduzida da categoria**, ela é o
 * formulário que aparece sozinho quando alguém classifica o chamado;
 * **marcada como modelo**, ela vira o botão "Impressora" que a pessoa
 * clica para carregar as perguntas certas.
 *
 * Por isso há uma tela e não duas: são as mesmas fichas, e ter duas
 * telas mexendo na mesma tabela faria alguém editar o "modelo" num
 * lugar e não entender por que o "formulário" mudou no outro.
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
          <h2 className="titulo-seccao">Modelos de chamado</h2>
          <p>
            As perguntas que cada tipo de chamado precisa fazer. Marcado como{' '}
            <strong>modelo</strong>, ele vira um botão na abertura e carrega os campos ao ser
            escolhido; sem a marca, ele ainda vale pela categoria — a filha herda o da categoria
            acima, e sem nenhum na árvore vale o padrão da organização.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
          Novo modelo
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
          <h3>Nenhum modelo</h3>
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
                  <th>Modelo</th>
                  <th>Onde aparece</th>
                  <th>Destino</th>
                  <th>Categoria</th>
                  <th className="-num">Campos</th>
                  <th className="-num">Chamados</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...formularios]
                  .sort(
                    (a, b) =>
                      // Os modelos primeiro, e entre eles a mesma ordem
                      // que a tela de abertura mostra: a lista aqui tem
                      // de parecer com a lista de lá.
                      Number(b.isModel) - Number(a.isModel) ||
                      a.position - b.position ||
                      a.name.localeCompare(b.name, 'pt-BR'),
                  )
                  .map((f) => (
                  <tr key={f.id}>
                    <td className="tabela-titulo-celula">
                      {f.name}
                      {f.isDefault ? (
                        <span className="selo -info" style={{ marginLeft: 'var(--e-2)' }}>
                          padrão
                        </span>
                      ) : null}
                      {f.description ? (
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          {f.description}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <OndeAparece formulario={f} />
                    </td>
                    <td>
                      {f.defaultAssignee?.name ?? f.defaultTeam?.name ?? (
                        <span className="campo-ajuda">pela categoria</span>
                      )}
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

/**
 * Em que porta esta ficha aparece.
 *
 * Um modelo é escolhido a dedo na abertura; uma ficha sem a marca só
 * chega pela categoria, e quem lê a tabela precisa ver a diferença sem
 * abrir a ficha — é ela que explica por que uma aparece na abertura e a
 * outra não.
 */
function OndeAparece({ formulario }: { formulario: FormularioView }) {
  if (!formulario.isModel) {
    return <span className="campo-ajuda">Só pela categoria</span>;
  }

  return (
    <span className="linha" style={{ gap: 'var(--e-1)', flexWrap: 'wrap' }}>
      <span className="selo -contorno">modelo</span>
      {formulario.isPublic ? <span className="selo -info">sem login</span> : null}
    </span>
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
    defaultTeamId?: string | null;
    defaultAssigneeId?: string | null;
    isModel?: boolean;
    isPublic?: boolean;
    description?: string | null;
    position?: number;
  }) => Promise<void>;
  aoRemover?: () => Promise<void>;
}) {
  const [name, setName] = useState(formulario?.name ?? '');
  const [categoryId, setCategoryId] = useState(formulario?.category?.id ?? '');
  const [isDefault, setIsDefault] = useState(formulario?.isDefault ?? false);
  const [isModel, setIsModel] = useState(formulario?.isModel ?? false);
  const [isPublic, setIsPublic] = useState(formulario?.isPublic ?? false);
  const [description, setDescription] = useState(formulario?.description ?? '');
  const [position, setPosition] = useState(String(formulario?.position ?? 0));
  const [fields, setFields] = useState<FormField[]>(formulario?.schema.fields ?? []);
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [times, setTimes] = useState<TimeView[]>([]);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [time, setTime] = useState(formulario?.defaultTeam?.id ?? '');
  const [responsavel, setResponsavel] = useState(formulario?.defaultAssignee?.id ?? '');
  const [previa, setPrevia] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarCategorias()
      .then(setCategorias)
      .catch(() => undefined);
    void listarTimes()
      .then(setTimes)
      .catch(() => undefined);
    void listarPessoas()
      .then(setPessoas)
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
        aria-label={formulario ? 'Editar modelo' : 'Novo modelo'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{formulario ? 'Editar modelo' : 'Novo modelo'}</h3>
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
              name,
              schema,
              categoryId: categoryId || null,
              isDefault,
              defaultTeamId: time || null,
              defaultAssigneeId: responsavel || null,
              isModel,
              // Ficha que não é modelo não aparece na abertura, e
              // portanto não pode ficar pública por engano: desmarcar
              // "modelo" apaga a abertura sem login junto.
              isPublic: isModel && isPublic,
              description: description.trim() || null,
              position: Number(position) || 0,
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
              <span>Para onde vai</span>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="time-formulario">
                  Time
                </label>
                <select
                  id="time-formulario"
                  className="select"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                >
                  <option value="">O que a categoria disser</option>
                  {times.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="responsavel-formulario">
                  Ou uma pessoa
                </label>
                <select
                  id="responsavel-formulario"
                  className="select"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                >
                  <option value="">Ninguém</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <span className="campo-ajuda">
              {responsavel
                ? 'A pessoa tem precedência: o chamado vai para ela, não para o time.'
                : time
                  ? 'Vence o destino da categoria — quem monta o modelo sabia da categoria e decidiu diferente.'
                  : 'Sem destino aqui, vale o da categoria. É o caso comum.'}
            </span>

            <div className="divisor-texto">
              <span>Na abertura</span>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={isModel}
                onChange={(e) => setIsModel(e.target.checked)}
              />
              <span className="switch-trilho" aria-hidden="true">
                <span className="switch-bolinha" />
              </span>
              <span>Oferecer como modelo na abertura</span>
            </label>
            <span className="campo-ajuda">
              Vira um cartão que a pessoa clica — “Impressora”, “Acesso à rede” — e que carrega
              estes campos. Sem a marca, a ficha continua valendo pela categoria.
            </span>

            {isModel ? (
              <>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="descricao-formulario">
                    Descrição do cartão (opcional)
                  </label>
                  <input
                    id="descricao-formulario"
                    className="input"
                    maxLength={200}
                    placeholder="Não imprime, atola, sem toner"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <span className="campo-ajuda">
                    A linha embaixo do nome. É ela que faz alguém escolher o cartão certo em vez do
                    primeiro da lista.
                  </span>
                </div>

                <div className="campo-grupo">
                  <div className="campo">
                    <label className="campo-rotulo" htmlFor="posicao-formulario">
                      Ordem
                    </label>
                    <input
                      id="posicao-formulario"
                      className="input"
                      type="number"
                      min={0}
                      max={999}
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                    />
                    <span className="campo-ajuda">
                      Menor primeiro. Empate desempata pelo nome.
                    </span>
                  </div>
                </div>

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  <span className="switch-trilho" aria-hidden="true">
                    <span className="switch-bolinha" />
                  </span>
                  <span>Também na abertura sem login</span>
                </label>
                <span className="campo-ajuda">
                  Quem abre pelo protocolo não fez login. Campo “só para quem atende” fica de fora
                  — nem aparece, nem é aceito por lá. O resto do formulário, porém, fica visível
                  para qualquer pessoa com o endereço: pergunta cuja existência já diz algo sobre a
                  empresa deve ser marcada como interna.
                </span>
              </>
            ) : null}

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
