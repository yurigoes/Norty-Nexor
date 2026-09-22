import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormularioResolvido, ModeloDeChamado } from '@norty-desk/shared';
import { validarRespostas } from '@norty-desk/shared';
import { DEFAULT_PRIORITY_MATRIX, ROTULO_ESCALA, computePriority, type Scale } from './escala';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';
import { modelosDeChamado, resolverFormulario } from '../../api/formularios';
import { CamposDinamicos } from '../formulario/CamposDinamicos';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { useRecurso } from '../../auth/Autenticacao';
import { MODIFICADOR_PRIORIDADE, ROTULO_PRIORIDADE } from '../../lib/formato';

/**
 * Abertura de chamado.
 *
 * No portal são três campos e um anexo; para o agente, os mesmos mais a
 * classificação. Não há um formulário de trinta campos como no GLPI: o
 * que falta o agente completa depois, com o chamado já aberto e o SLA
 * já correndo (`docs/02-gap-analysis.md`, item 9).
 */
export function NovoChamado({ noPortal = false }: { noPortal?: boolean }) {
  const navegar = useNavigate();
  const { dado: categorias } = useRecurso(() => api.listarCategorias(), []);

  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [urgencia, setUrgencia] = useState<Scale>(3);
  const [impacto, setImpacto] = useState<Scale>(3);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [observadores, setObservadores] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // O formulário vem da categoria, resolvido pela API — inclusive a
  // herança da categoria acima e o padrão da organização. A tela não
  // reproduz essa regra; ela pergunta.
  const [formulario, setFormulario] = useState<FormularioResolvido['form']>(null);
  /**
   * O modelo escolhido no painel rápido.
   *
   * Quando há um, ele manda: os campos são os dele e o chamado nasce
   * com o `formId` dele, o que também traz o destino configurado. Sem
   * modelo, vale a herança da categoria, como sempre valeu.
   */
  const [modelos, setModelos] = useState<ModeloDeChamado[]>([]);
  const [modelo, setModelo] = useState<ModeloDeChamado | null>(null);
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});

  useEffect(() => {
    void modelosDeChamado()
      .then(setModelos)
      .catch(() => setModelos([]));
  }, []);

  useEffect(() => {
    // Com modelo escolhido, a categoria não decide mais o formulário.
    if (modelo) return;

    let atual = true;
    void resolverFormulario(categoria || null)
      .then((r) => {
        if (!atual) return;
        setFormulario(r.form);
        // Troca de categoria troca de formulário: manter as respostas
        // antigas mandaria chaves de outro schema, que a API recusa.
        setRespostas({});
        setErrosDeCampo({});
      })
      .catch(() => atual && setFormulario(null));
    return () => {
      atual = false;
    };
  }, [categoria, modelo]);

  /**
   * Clicar no bloco carrega o modelo pronto.
   *
   * As respostas antigas vão junto: manter chaves de outro schema
   * mandaria para a API campos que ela recusa, com uma mensagem sobre
   * um campo que a pessoa não vê mais.
   *
   * Clicar de novo no mesmo bloco desfaz a escolha — é o único jeito de
   * voltar ao formulário da categoria sem recarregar a tela.
   */
  function escolherModelo(escolhido: ModeloDeChamado | null) {
    setModelo(escolhido);
    setRespostas({});
    setErrosDeCampo({});
    if (escolhido?.category) setCategoria(escolhido.category.id);
    // O assunto **não** é preenchido com o nome do modelo. Seria
    // cômodo e deixaria a fila com dez chamados chamados "Impressora",
    // que é o mesmo que não ter assunto — quem tria precisa distinguir
    // um do outro pela linha, não abrir os dez.
  }

  /** Os campos que valem agora: os do modelo, ou os da categoria. */
  const schemaEmUso = modelo?.schema ?? formulario?.schema ?? null;

  // A prioridade é mostrada, não escolhida: o usuário vê o resultado da
  // matriz enquanto mexe em urgência e impacto (CLAUDE.md, regra 7).
  const prioridade = computePriority(urgencia, impacto, DEFAULT_PRIORITY_MATRIX);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    // A mesma função pura que a API usa. Aqui ela existe para dizer o
    // que falta antes de enviar; lá, porque é a API que responde por isso.
    if (schemaEmUso) {
      const visivel = noPortal
        ? { fields: schemaEmUso.fields.filter((c) => !c.internal) }
        : schemaEmUso;
      const problemas = validarRespostas(visivel, respostas);

      if (problemas.length > 0) {
        setErrosDeCampo(Object.fromEntries(problemas.map((p) => [p.key, p.mensagem])));
        setErro('Confira os campos marcados abaixo.');
        setEnviando(false);
        return;
      }
    }

    try {
      const chamado = await api.abrirChamado({
        subject: assunto.trim(),
        description: descricao.trim(),
        ...(categoria ? { categoryId: categoria } : {}),
        // O modelo escolhido vai junto: é ele que diz quais campos
        // foram respondidos e para onde o chamado vai.
        ...(modelo ? { formId: modelo.id } : {}),
        ...(noPortal ? {} : { urgency: urgencia, impact: impacto }),
        ...(schemaEmUso && Object.keys(respostas).length > 0 ? { customFields: respostas } : {}),
        ...(observadores.length > 0
          ? { observers: observadores.map((id) => ({ kind: 'USER' as const, id })) }
          : {}),
      });

      if (arquivo) await api.anexar(chamado.id, arquivo);

      navegar(noPortal ? `/chamados/${chamado.id}` : `/chamados/${chamado.id}`);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível abrir o chamado.');
      setEnviando(false);
    }
  }

  return (
    <form className="card" onSubmit={enviar} style={{ maxWidth: 720 }}>
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">Abrir chamado</h2>
          <p className="card-sub">
            Descreva o que está acontecendo. O resto a equipe completa.
          </p>
        </div>
      </div>

      <div className="card-corpo pilha">
        {erro ? (
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {modelos.length > 0 ? (
          <div className="pilha-sm">
            <span className="campo-rotulo">O que você precisa?</span>
            <div className="modelos">
              {modelos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`modelo ${modelo?.id === m.id ? '-escolhido' : ''}`}
                  aria-pressed={modelo?.id === m.id}
                  onClick={() => escolherModelo(modelo?.id === m.id ? null : m)}
                >
                  <strong>{m.name}</strong>
                  {m.description ? <span className="modelo-frase">{m.description}</span> : null}
                </button>
              ))}
            </div>
            <span className="campo-ajuda">
              {modelo
                ? 'Clique de novo no mesmo bloco para voltar ao formulário da categoria.'
                : 'Clique num bloco e as perguntas certas aparecem prontas. Ou preencha à mão, abaixo.'}
            </span>
          </div>
        ) : null}

        <div className="campo">
          <label className="campo-rotulo" htmlFor="assunto">
            Assunto
          </label>
          <input
            id="assunto"
            className="input"
            required
            minLength={3}
            maxLength={255}
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder={
              modelo
                ? `${modelo.name}: o que está acontecendo, em uma linha`
                : 'Impressora do 3º andar não imprime'
            }
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="descricao">
            O que está acontecendo
          </label>
          <textarea
            id="descricao"
            className="textarea"
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Desde quando, o que já tentou, qual a mensagem de erro."
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="categoria">
            Categoria
          </label>
          <select
            id="categoria"
            className="select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">Não sei classificar</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="campo-ajuda">
            A categoria define quem atende — um time ou uma pessoa — e o prazo de resposta.
          </span>
        </div>

        <Observadores
          escolhidos={observadores}
          aoMudar={setObservadores}
          // No portal, o solicitante escolhe quem acompanha junto entre
          // as pessoas que ele já enxerga. Se a API não devolver a
          // lista para o perfil dele, o campo some em vez de aparecer
          // vazio prometendo o que não entrega.
        />

        {schemaEmUso ? (
          <CamposDinamicos
            schema={schemaEmUso}
            respostas={respostas}
            noPortal={noPortal}
            erros={errosDeCampo}
            aoMudar={(chave, valor) =>
              setRespostas((atual) => {
                const proximo = { ...atual };
                // Campo esvaziado sai do objeto: mandar `undefined` no
                // JSON viraria chave ausente de qualquer jeito, e mandar
                // string vazia faria o obrigatório passar.
                if (valor === undefined || valor === '') delete proximo[chave];
                else proximo[chave] = valor;
                return proximo;
              })
            }
          />
        ) : null}

        {!noPortal ? (
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="urgencia">
                Urgência
              </label>
              <select
                id="urgencia"
                className="select"
                value={urgencia}
                onChange={(e) => setUrgencia(Number(e.target.value) as Scale)}
              >
                {([1, 2, 3, 4, 5] as Scale[]).map((n) => (
                  <option key={n} value={n}>
                    {n} · {ROTULO_ESCALA[n]}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="impacto">
                Impacto
              </label>
              <select
                id="impacto"
                className="select"
                value={impacto}
                onChange={(e) => setImpacto(Number(e.target.value) as Scale)}
              >
                {([1, 2, 3, 4, 5] as Scale[]).map((n) => (
                  <option key={n} value={n}>
                    {n} · {ROTULO_ESCALA[n]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {!noPortal ? (
          <div className="linha-entre">
            <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
              Prioridade resultante
            </span>
            <span className={`prio ${MODIFICADOR_PRIORIDADE[prioridade]}`}>
              <span className="prio-ponto" aria-hidden="true" />
              {prioridade} · {ROTULO_PRIORIDADE[prioridade]}
            </span>
          </div>
        ) : null}

        <div className="campo">
          <label className="campo-rotulo" htmlFor="anexo-novo">
            Anexo (opcional)
          </label>
          <input
            id="anexo-novo"
            className="input"
            type="file"
            style={{ paddingTop: 7 }}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="card-rodape linha" style={{ justifyContent: 'flex-end', gap: 'var(--e-2)' }}>
        <button type="button" className="btn -secundario" onClick={() => navegar('/')}>
          Cancelar
        </button>
        <button
          type="submit"
          className={`btn -primario ${enviando ? '-carregando' : ''}`}
          disabled={enviando}
        >
          Abrir chamado
        </button>
      </div>
    </form>
  );
}

/**
 * Quem acompanha junto.
 *
 * O papel `OBSERVADOR` já existia no chamado; faltava a porta para
 * usá-lo na abertura — que é quando a pessoa sabe quem mais precisa
 * ficar sabendo. Somar observador depois é possível, mas a essa altura
 * já se perdeu a primeira resposta.
 *
 * O campo some quando a lista de pessoas não vem: aparecer vazio
 * prometeria uma escolha que não existe.
 */
function Observadores({
  escolhidos,
  aoMudar,
}: {
  escolhidos: string[];
  aoMudar: (ids: string[]) => void;
}) {
  const { dado: pessoas } = useRecurso(
    () => listarPessoas().catch(() => [] as PessoaView[]),
    [],
  );

  if (!pessoas || pessoas.length === 0) return null;

  const disponiveis = pessoas.filter((p) => !escolhidos.includes(p.id));

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor="observador">
        Quem acompanha junto (opcional)
      </label>

      {escolhidos.length > 0 ? (
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          {escolhidos.map((id) => {
            const pessoa = pessoas.find((p) => p.id === id);
            return (
              <span key={id} className="selo -contorno">
                {pessoa?.name ?? 'Pessoa'}
                <button
                  type="button"
                  className="selo-x"
                  aria-label={`Tirar ${pessoa?.name ?? 'pessoa'} dos observadores`}
                  onClick={() => aoMudar(escolhidos.filter((e) => e !== id))}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <select
        id="observador"
        className="select"
        value=""
        onChange={(e) => {
          if (e.target.value) aoMudar([...escolhidos, e.target.value]);
        }}
        disabled={disponiveis.length === 0}
      >
        <option value="">
          {disponiveis.length === 0 ? 'Todo mundo já está na lista' : 'Somar alguém…'}
        </option>
        {disponiveis.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <span className="campo-ajuda">
        Quem você somar aqui enxerga o chamado e recebe as respostas.
      </span>
    </div>
  );
}
