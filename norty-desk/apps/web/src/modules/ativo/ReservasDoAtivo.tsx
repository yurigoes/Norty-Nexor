import { useCallback, useEffect, useState } from 'react';
import type { ReservaView } from '@norty-desk/shared';

import { cancelarReserva, reservarAtivo, reservasDoAtivo } from '../../api/ativos';
import { ErroDaApi } from '../../api/cliente';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

const ROTULO_SITUACAO: Record<ReservaView['situacao'], string> = {
  EM_CURSO: 'Em curso',
  FUTURA: 'Agendada',
  RETIRADA: 'Retirada',
  VENCIDA: 'Venceu sem retirar',
  CANCELADA: 'Cancelada',
};

const SELO_SITUACAO: Record<ReservaView['situacao'], string> = {
  EM_CURSO: '-sucesso',
  FUTURA: '-info',
  RETIRADA: '-neutro',
  VENCIDA: '-aviso',
  CANCELADA: '-neutro',
};

/** `datetime-local` quer `YYYY-MM-DDTHH:mm` na hora local, sem fuso. */
function paraCampo(quando: Date): string {
  const local = new Date(quando.getTime() - quando.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * O que está separado para alguém, e quando.
 *
 * O notebook de empréstimo, o projetor, a máquina de teste: o que é
 * pouco e disputado. Sem isto a reserva vive no grupo do WhatsApp, e
 * duas pessoas levam o mesmo equipamento na mesma sexta.
 *
 * A lista mostra a **vencida sem retirar** de propósito: é o número que
 * diz se as reservas estão servindo para alguma coisa ou se viraram
 * ritual — equipamento separado e não retirado é equipamento que ficou
 * parado sem precisar.
 */
export function ReservasDoAtivoCard({ assetId }: { assetId: string }) {
  const { can } = useAutenticacao();
  const podeReservar = can('ativo:reservar');

  const [reservas, setReservas] = useState<ReservaView[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState<{
    userId: string;
    startsAt: string;
    endsAt: string;
    purpose: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    setReservas(await reservasDoAtivo(assetId));
  }, [assetId]);

  useEffect(() => {
    void carregar().catch(() => setReservas([]));
  }, [carregar]);

  async function agir(acao: () => Promise<ReservaView[]>) {
    setErro(null);
    try {
      setReservas(await acao());
      setNova(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    }
  }

  async function abrirFormulario() {
    const agora = new Date();
    const fim = new Date(agora.getTime() + 4 * 3_600_000);

    setNova({
      userId: '',
      startsAt: paraCampo(agora),
      endsAt: paraCampo(fim),
      purpose: '',
    });

    if (pessoas.length === 0) setPessoas(await listarPessoas().catch(() => []));
  }

  // A vencida e a cancelada interessam menos, e empurram para baixo o
  // que está por vir. Ficam, mas depois.
  const ordenadas = [...(reservas ?? [])].sort((a, b) => {
    const peso = (r: ReservaView) =>
      r.situacao === 'EM_CURSO' ? 0 : r.situacao === 'FUTURA' ? 1 : 2;
    return peso(a) - peso(b) || a.startsAt.localeCompare(b.startsAt);
  });

  return (
    <section className="card">
      <div className="card-topo">
        <h3 className="card-titulo">Reservas</h3>
        {podeReservar && !nova ? (
          <button type="button" className="btn -secundario -sm" onClick={() => void abrirFormulario()}>
            Reservar
          </button>
        ) : null}
      </div>

      <div className="card-corpo pilha-sm">
        {erro ? (
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {nova ? (
          <form
            className="pilha-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void agir(() =>
                reservarAtivo(assetId, {
                  userId: nova.userId,
                  startsAt: new Date(nova.startsAt).toISOString(),
                  endsAt: new Date(nova.endsAt).toISOString(),
                  purpose: nova.purpose.trim() || null,
                }),
              );
            }}
          >
            <div className="campo">
              <label className="campo-rotulo" htmlFor="res-pessoa">
                Para quem
              </label>
              <select
                id="res-pessoa"
                className="select"
                required
                value={nova.userId}
                onChange={(e) => setNova({ ...nova, userId: e.target.value })}
              >
                <option value="">Escolha a pessoa</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
              <div className="campo" style={{ flex: '1 1 200px' }}>
                <label className="campo-rotulo" htmlFor="res-de">
                  De
                </label>
                <input
                  id="res-de"
                  className="input"
                  type="datetime-local"
                  required
                  value={nova.startsAt}
                  onChange={(e) => setNova({ ...nova, startsAt: e.target.value })}
                />
              </div>
              <div className="campo" style={{ flex: '1 1 200px' }}>
                <label className="campo-rotulo" htmlFor="res-ate">
                  Até
                </label>
                <input
                  id="res-ate"
                  className="input"
                  type="datetime-local"
                  required
                  value={nova.endsAt}
                  onChange={(e) => setNova({ ...nova, endsAt: e.target.value })}
                />
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="res-motivo">
                Para quê
              </label>
              <input
                id="res-motivo"
                className="input"
                maxLength={300}
                placeholder="Visita ao cliente na sexta"
                value={nova.purpose}
                onChange={(e) => setNova({ ...nova, purpose: e.target.value })}
              />
              <span className="campo-ajuda">
                Aparece na recusa de quem tentar levar o equipamento no meio da sua janela.
              </span>
            </div>

            <div className="linha" style={{ gap: 'var(--e-2)' }}>
              <button type="submit" className="btn -primario -sm">
                Reservar
              </button>
              <button type="button" className="btn -fantasma -sm" onClick={() => setNova(null)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {!reservas ? (
          <div className="sk sk-linha" />
        ) : ordenadas.length === 0 ? (
          <p className="campo-ajuda">Nada separado. Reservar evita que dois levem o mesmo.</p>
        ) : (
          ordenadas.map((r) => (
            <div key={r.id} className="linha-entre" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
              <div>
                <strong>{r.user.name}</strong>
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {dataCurta(r.startsAt)} até {dataCurta(r.endsAt)}
                  {r.purpose ? ` · ${r.purpose}` : ''}
                  {r.createdBy.id === r.user.id ? '' : ` · separado por ${r.createdBy.name}`}
                  {r.canceledReason ? ` · ${r.canceledReason}` : ''}
                </span>
              </div>

              <div className="linha" style={{ gap: 'var(--e-1)' }}>
                <span className={`selo ${SELO_SITUACAO[r.situacao]}`}>
                  {ROTULO_SITUACAO[r.situacao]}
                </span>
                {podeReservar && (r.situacao === 'FUTURA' || r.situacao === 'EM_CURSO') ? (
                  <button
                    type="button"
                    className="btn -fantasma -sm"
                    onClick={() => void agir(() => cancelarReserva(r.id))}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
