import { useEffect, useState } from 'react';
import {
  FACES_DO_PAINEL,
  ORDENS_DO_PAINEL,
  ROTULO_FACE_DO_PAINEL,
  ROTULO_ORDEM_DO_PAINEL,
  ROTULO_TIPO_DE_ZONA,
  TIPOS_DE_ZONA,
  desenharPainel,
  type FaceDoPainel,
  type ModeloDeAtivoView,
  type OrdemDoPainel,
  type PainelDoModeloView,
  type TipoDeZona,
  type ZonaDoPainelView,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarZonaDoPainel,
  editarZonaDoPainel,
  escreverPainel,
  paineisDoModelo,
  removerPainel,
  removerZonaDoPainel,
} from '../../api/painel';

/**
 * O estêncil do painel, do lado de quem o cadastra.
 *
 * Quatro números e uma ordem descrevem o painel inteiro: colunas,
 * linhas, onde a numeração começa e por onde ela corre. O desenho
 * aparece ali mesmo, antes de salvar — é o mesmo `desenharPainel` que a
 * API usa, e é o que faz alguém perceber na hora que escolheu a ordem
 * errada: num switch de 24, a porta 13 fica na sétima coluna de cima por
 * um lado e na primeira coluna de baixo pelo outro.
 *
 * O que a grade não descreve — console, SFP fora da fileira, furo no
 * painel — entra clicando na posição.
 */

type Rascunho = {
  columns: string;
  rows: string;
  numbering: OrdemDoPainel;
  startAt: string;
  slots: string;
  notes: string;
};

const NOVO: Rascunho = {
  columns: '12',
  rows: '2',
  numbering: 'COLUNA',
  startAt: '1',
  slots: '',
  notes: '',
};

function paraRascunho(p: PainelDoModeloView): Rascunho {
  return {
    columns: String(p.columns),
    rows: String(p.rows),
    numbering: p.numbering,
    startAt: String(p.startAt),
    slots: p.slots === null ? '' : String(p.slots),
    notes: p.notes ?? '',
  };
}

export function PainelDoModelo({
  modelo,
  aoFechar,
}: {
  modelo: ModeloDeAtivoView;
  aoFechar: () => void;
}) {
  const [paineis, setPaineis] = useState<PainelDoModeloView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void paineisDoModelo(modelo.id)
      .then(setPaineis)
      .catch(() => setPaineis([]));
  }, [modelo.id]);

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar o painel.');

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3>Painel de {modelo.name}</h3>
          <p className="suave">
            Onde cada porta fica no equipamento. Vale para{' '}
            {modelo.assetCount === 0
              ? 'os equipamentos deste modelo'
              : modelo.assetCount === 1
                ? 'o equipamento deste modelo'
                : `os ${modelo.assetCount} equipamentos deste modelo`}{' '}
            — é o que faz trinta switches iguais terem um desenho só.
          </p>
        </div>
        <button type="button" className="btn -fantasma -sm" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      <div className="card-corpo pilha">
        {erro ? (
          <div className="alerta-bloco -erro" role="alert">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {!paineis ? (
          <div className="sk sk-bloco" />
        ) : (
          FACES_DO_PAINEL.map((face) => (
            <Face
              /*
               * A chave carrega o painel: criar ou apagar a face monta o
               * bloco de novo, e o rascunho nasce do que está salvo sem
               * precisar de um efeito para sincronizá-lo.
               */
              key={`${face}:${paineis.find((p) => p.face === face)?.id ?? 'sem'}`}
              face={face}
              modeloId={modelo.id}
              painel={paineis.find((p) => p.face === face) ?? null}
              aoMudar={(lista) => {
                setErro(null);
                setPaineis(lista);
              }}
              aoFalhar={falhar}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Face({
  face,
  modeloId,
  painel,
  aoMudar,
  aoFalhar,
}: {
  face: FaceDoPainel;
  modeloId: string;
  painel: PainelDoModeloView | null;
  aoMudar: (lista: PainelDoModeloView[]) => void;
  aoFalhar: (e: unknown) => void;
}) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(painel ? paraRascunho(painel) : null);
  const [zona, setZona] = useState<
    { id: string | null; column: number; row: number; kind: TipoDeZona; label: string; portNumber: string } | null
  >(null);

  const muda = (campo: keyof Rascunho) => (e: { target: { value: string } }) =>
    setRascunho((r) => (r ? { ...r, [campo]: e.target.value } : r));

  // A pré-visualização é do rascunho, não do que está salvo: é para isso
  // que ela serve — ver a numeração antes de gravá-la.
  const grade = rascunho
    ? {
        columns: Math.min(Math.max(Number(rascunho.columns) || 0, 1), 64),
        rows: Math.min(Math.max(Number(rascunho.rows) || 0, 1), 8),
        numbering: rascunho.numbering,
        startAt: Math.max(Number(rascunho.startAt) || 0, 0),
        slots: rascunho.slots.trim() ? Number(rascunho.slots) : null,
      }
    : null;

  const zonas: ZonaDoPainelView[] = painel?.zones ?? [];
  const celulas = grade ? desenharPainel(grade, zonas) : [];

  async function salvar() {
    if (!rascunho || !grade) return;
    try {
      aoMudar(
        await escreverPainel(modeloId, face, {
          columns: grade.columns,
          rows: grade.rows,
          numbering: grade.numbering,
          startAt: grade.startAt,
          slots: grade.slots,
          notes: rascunho.notes.trim() || null,
        }),
      );
    } catch (e) {
      aoFalhar(e);
    }
  }

  if (!painel && !rascunho) {
    return (
      <div className="linha-entre">
        <span className="campo-ajuda">
          <strong>{ROTULO_FACE_DO_PAINEL[face]}</strong> — sem painel cadastrado.
        </span>
        <button type="button" className="btn -fantasma -sm" onClick={() => setRascunho(NOVO)}>
          Desenhar {face === 'FRENTE' ? 'a frente' : 'a traseira'}
        </button>
      </div>
    );
  }

  if (!rascunho || !grade) return null;

  return (
    <div className="pilha-sm" style={{ borderTop: '1px solid var(--borda)', paddingTop: 'var(--e-4)' }}>
      <div className="linha-entre">
        <strong>{ROTULO_FACE_DO_PAINEL[face]}</strong>
        <span className="campo-ajuda">
          {celulas.filter((c) => c.numero !== null).length} porta(s) neste desenho
          {painel ? ` · ${painel.zones.length} zona(s)` : ''}
        </span>
      </div>

      <div className="campo-grupo">
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`pn-col-${face}`}>
            Colunas
          </label>
          <input
            id={`pn-col-${face}`}
            className="input"
            inputMode="numeric"
            value={rascunho.columns}
            onChange={muda('columns')}
          />
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`pn-lin-${face}`}>
            Fileiras
          </label>
          <input
            id={`pn-lin-${face}`}
            className="input"
            inputMode="numeric"
            value={rascunho.rows}
            onChange={muda('rows')}
          />
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`pn-ord-${face}`}>
            Numeração
          </label>
          <select
            id={`pn-ord-${face}`}
            className="input"
            value={rascunho.numbering}
            onChange={(e) =>
              setRascunho({ ...rascunho, numbering: e.target.value as OrdemDoPainel })
            }
          >
            {ORDENS_DO_PAINEL.map((o) => (
              <option key={o} value={o}>
                {ROTULO_ORDEM_DO_PAINEL[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`pn-ini-${face}`}>
            Primeira porta
          </label>
          <input
            id={`pn-ini-${face}`}
            className="input"
            inputMode="numeric"
            value={rascunho.startAt}
            onChange={muda('startAt')}
          />
          <span className="campo-ajuda">1 no switch; 0 onde as placas são `eth0`.</span>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`pn-slo-${face}`}>
            Portas (se a grade sobra)
          </label>
          <input
            id={`pn-slo-${face}`}
            className="input"
            inputMode="numeric"
            placeholder="todas"
            value={rascunho.slots}
            onChange={muda('slots')}
          />
          <span className="campo-ajuda">Dez portas numa fileira desenhada de doze.</span>
        </div>
      </div>

      <span className="campo-ajuda">
        {painel
          ? 'Clique numa posição para marcar o que há ali: console, fonte, tomada ou furo no painel.'
          : 'Salve o painel para poder marcar console, fonte ou furo nas posições.'}
      </span>

      <div style={{ overflowX: 'auto' }}>
        <div
          className="painel"
          style={{
            gridTemplateColumns: `repeat(${grade.columns}, var(--painel-celula))`,
            gridTemplateRows: `repeat(${grade.rows}, var(--painel-celula))`,
          }}
        >
          {celulas.map((c) => {
            const naoEPorta = c.kind !== 'PORTA';
            const classe = [
              'painel-celula',
              naoEPorta ? '-outro' : '',
              !naoEPorta && c.numero === null ? '-vazia' : '',
              zona && zona.column === c.column && zona.row === c.row ? '-escolhida' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const daZona = zonas.find((z) => z.column === c.column && z.row === c.row);

            return (
              <button
                key={`${c.column}:${c.row}`}
                type="button"
                className={classe}
                style={{ gridColumn: c.column, gridRow: c.row }}
                disabled={!painel}
                title={
                  painel
                    ? `Coluna ${c.column}, linha ${c.row}${c.numero === null ? '' : ` · porta ${c.numero}`} — clique para marcar o que há aqui`
                    : 'Salve o painel para marcar console, fonte ou furo'
                }
                onClick={() =>
                  setZona({
                    id: daZona?.id ?? null,
                    column: c.column,
                    row: c.row,
                    kind: daZona?.kind ?? 'CONSOLE',
                    label: daZona?.label ?? '',
                    portNumber: daZona?.portNumber === undefined || daZona?.portNumber === null ? '' : String(daZona.portNumber),
                  })
                }
              >
                {naoEPorta ? (c.label ?? '·').slice(0, 3) : (c.numero ?? '')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={`pn-obs-${face}`}>
          Observação
        </label>
        <input
          id={`pn-obs-${face}`}
          className="input"
          value={rascunho.notes}
          onChange={muda('notes')}
          placeholder="Os dois SFP+ ficam à direita, fora da fileira"
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <button type="button" className="btn -primario -sm" onClick={() => void salvar()}>
          {painel ? 'Salvar o painel' : 'Criar o painel'}
        </button>
        {painel ? (
          <button
            type="button"
            className="btn -perigo -sm"
            onClick={() => {
              if (!window.confirm(`Apagar o painel da ${ROTULO_FACE_DO_PAINEL[face].toLowerCase()}?`)) return;
              void removerPainel(modeloId, face).then(aoMudar).catch(aoFalhar);
            }}
          >
            Apagar o painel
          </button>
        ) : (
          <button type="button" className="btn -fantasma -sm" onClick={() => setRascunho(null)}>
            Cancelar
          </button>
        )}
      </div>

      {zona ? (
        <form
          className="pilha-sm"
          style={{ border: '1px solid var(--borda)', borderRadius: 'var(--r-md)', padding: 'var(--e-3)' }}
          onSubmit={(e) => {
            e.preventDefault();
            const dados = {
              column: zona.column,
              row: zona.row,
              kind: zona.kind,
              label: zona.label.trim() || null,
              portNumber: zona.portNumber.trim() ? Number(zona.portNumber) : null,
            };

            const salvando = zona.id
              ? editarZonaDoPainel(modeloId, face, zona.id, dados)
              : criarZonaDoPainel(modeloId, face, dados);

            void salvando
              .then((lista) => {
                aoMudar(lista);
                setZona(null);
              })
              .catch(aoFalhar);
          }}
        >
          <strong>
            Coluna {zona.column}, linha {zona.row}
          </strong>
          <span className="campo-ajuda">
            A zona manda sobre a grade e não consome número: marcar um console no meio do painel
            não empurra a numeração, porque no equipamento ele também não empurra.
          </span>

          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor={`pz-tipo-${face}`}>
                O que há aqui
              </label>
              <select
                id={`pz-tipo-${face}`}
                className="input"
                value={zona.kind}
                onChange={(e) => setZona({ ...zona, kind: e.target.value as TipoDeZona })}
              >
                {TIPOS_DE_ZONA.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_DE_ZONA[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor={`pz-rot-${face}`}>
                Rótulo
              </label>
              <input
                id={`pz-rot-${face}`}
                className="input"
                value={zona.label}
                onChange={(e) => setZona({ ...zona, label: e.target.value })}
                placeholder="Console"
              />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor={`pz-num-${face}`}>
                Porta (se for uma)
              </label>
              <input
                id={`pz-num-${face}`}
                className="input"
                inputMode="numeric"
                value={zona.portNumber}
                onChange={(e) => setZona({ ...zona, portNumber: e.target.value })}
                placeholder="49"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--e-2)', flexWrap: 'wrap' }}>
            <button type="submit" className="btn -primario -sm">
              Salvar a zona
            </button>
            {zona.id ? (
              <button
                type="button"
                className="btn -perigo -sm"
                onClick={() => {
                  void removerZonaDoPainel(modeloId, face, zona.id!)
                    .then((lista) => {
                      aoMudar(lista);
                      setZona(null);
                    })
                    .catch(aoFalhar);
                }}
              >
                Apagar a zona
              </button>
            ) : null}
            <button type="button" className="btn -fantasma -sm" onClick={() => setZona(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
