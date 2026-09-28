import { useEffect, useState } from 'react';
import type { Channel, FiltroSalvavel, Scale, TicketStatus, TicketType } from '@norty-desk/shared';
import {
  ROTULO_CANAL,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  ROTULO_TIPO,
  camposUsados,
} from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import type { CategoriaView } from '../../api/endpoints';
import type { TimeView } from '@norty-desk/shared';

const STATUS: TicketStatus[] = [
  'NOVO',
  'ATRIBUIDO',
  'PLANEJADO',
  'PENDENTE',
  'EM_APROVACAO',
  'SOLUCIONADO',
  'FECHADO',
];

const PRIORIDADES: Scale[] = [1, 2, 3, 4, 5];
const CANAIS: Channel[] = ['WEB', 'EMAIL', 'WHATSAPP', 'API', 'SISTEMA'];
const TIPOS: TicketType[] = ['INCIDENTE', 'REQUISICAO'];

/**
 * O painel de filtro da fila.
 *
 * A API aceitava onze campos de filtro desde a Fase 1; a tela oferecia
 * cinco combinações fixas e a busca do cabeçalho. O resto só se alcançava
 * editando a barra de endereços — o que na prática quer dizer que ninguém
 * alcançava.
 *
 * Trabalha sobre uma **cópia** do filtro e só a entrega no "Aplicar":
 * cada marca de caixa recarregando a fila daria seis consultas para
 * montar um filtro de seis campos, e a lista pulando embaixo da mão de
 * quem ainda está escolhendo.
 *
 * As listas de status, prioridade e canal são de marcar várias, porque é
 * assim que a fila responde: `status=NOVO,PENDENTE` é "um ou outro".
 */
export function FiltroDaFila({
  filtro,
  aoAplicar,
  aoFechar,
}: {
  filtro: FiltroSalvavel;
  aoAplicar: (filtro: FiltroSalvavel) => void;
  aoFechar: () => void;
}) {
  const [rascunho, setRascunho] = useState<FiltroSalvavel>(filtro);
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [times, setTimes] = useState<TimeView[]>([]);

  useEffect(() => {
    void api
      .listarCategorias()
      .then(setCategorias)
      .catch(() => undefined);
    void api
      .listarTimes()
      .then(setTimes)
      .catch(() => undefined);
  }, []);

  /** Liga ou desliga um valor numa lista, tirando a lista vazia. */
  function alternar<T>(campo: 'status' | 'priority' | 'channel', valor: T) {
    setRascunho((atual) => {
      const lista = (atual[campo] ?? []) as T[];
      const proxima = lista.includes(valor)
        ? lista.filter((v) => v !== valor)
        : [...lista, valor];

      // Lista vazia é o mesmo que campo ausente, e guardar `[]` faria o
      // painel mostrar um filtro ativo que não filtra nada.
      return { ...atual, [campo]: proxima.length === 0 ? undefined : proxima };
    });
  }

  /** Um campo de valor único: vazio vira ausente. */
  function definir(campo: keyof FiltroSalvavel, valor: string | boolean | undefined) {
    setRascunho((atual) => ({
      ...atual,
      [campo]: valor === '' || valor === false ? undefined : valor,
    }));
  }

  const usados = camposUsados(rascunho);

  return (
    <form
      className="cartao pilha"
      onSubmit={(e) => {
        e.preventDefault();
        aoAplicar(rascunho);
      }}
    >
      <div className="linha-entre">
        <h3 className="titulo-secao">Filtrar a fila</h3>
        <button type="button" className="btn -fantasma -sm" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      <fieldset className="pilha-sm">
        <legend className="campo-rotulo">Situação</legend>
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          {STATUS.map((s) => (
            <label key={s} className="check">
              <input
                type="checkbox"
                checked={rascunho.status?.includes(s) ?? false}
                onChange={() => alternar('status', s)}
              />
              <span>{ROTULO_STATUS[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="pilha-sm">
        <legend className="campo-rotulo">Prioridade</legend>
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          {PRIORIDADES.map((p) => (
            <label key={p} className="check">
              <input
                type="checkbox"
                checked={rascunho.priority?.includes(p) ?? false}
                onChange={() => alternar('priority', p)}
              />
              <span>{ROTULO_PRIORIDADE[p]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="pilha-sm">
        <legend className="campo-rotulo">Canal de origem</legend>
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          {CANAIS.map((c) => (
            <label key={c} className="check">
              <input
                type="checkbox"
                checked={rascunho.channel?.includes(c) ?? false}
                onChange={() => alternar('channel', c)}
              />
              <span>{ROTULO_CANAL[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grade-2">
        <div className="campo">
          <label className="campo-rotulo" htmlFor="filtro-tipo">
            Tipo
          </label>
          <select
            id="filtro-tipo"
            className="select"
            value={rascunho.type ?? ''}
            onChange={(e) => definir('type', e.target.value)}
          >
            <option value="">Qualquer</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="filtro-categoria">
            Categoria
          </label>
          <select
            id="filtro-categoria"
            className="select"
            value={rascunho.categoryId ?? ''}
            onChange={(e) => definir('categoryId', e.target.value)}
          >
            <option value="">Qualquer</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="filtro-time">
            Time atribuído
          </label>
          <select
            id="filtro-time"
            className="select"
            value={rascunho.assignedTeamId ?? ''}
            onChange={(e) => definir('assignedTeamId', e.target.value)}
          >
            <option value="">Qualquer</option>
            {times.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="filtro-atribuido">
            Atribuído a
          </label>
          <select
            id="filtro-atribuido"
            className="select"
            value={rascunho.assignedUserId ?? ''}
            onChange={(e) => definir('assignedUserId', e.target.value)}
          >
            <option value="">Qualquer</option>
            {/*
              `me`, e não o id de quem está olhando: é o que faz a busca
              salva continuar valendo se um dia ela for copiada, e o que
              a deixa dizer "meus" em vez de um nome.
            */}
            <option value="me">A mim</option>
          </select>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="filtro-vencendo">
            SLA vencendo antes de
          </label>
          <input
            id="filtro-vencendo"
            className="input"
            type="date"
            value={rascunho.slaDueBefore?.slice(0, 10) ?? ''}
            onChange={(e) =>
              // Data sem hora: o fim do dia escolhido é o que a pessoa
              // quer dizer com "antes de amanhã".
              definir('slaDueBefore', e.target.value ? `${e.target.value}T23:59:59.999Z` : '')
            }
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="filtro-texto">
            Contendo o texto
          </label>
          <input
            id="filtro-texto"
            className="input"
            value={rascunho.q ?? ''}
            onChange={(e) => definir('q', e.target.value)}
            placeholder="assunto, descrição, protocolo"
          />
        </div>
      </div>

      <div className="linha" style={{ gap: 'var(--e-4)', flexWrap: 'wrap' }}>
        <label className="check">
          <input
            type="checkbox"
            checked={rascunho.semAtribuicao ?? false}
            onChange={(e) => definir('semAtribuicao', e.target.checked)}
          />
          <span>Sem atribuição</span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={rascunho.slaBreached ?? false}
            onChange={(e) => definir('slaBreached', e.target.checked)}
          />
          <span>SLA estourado</span>
        </label>
      </div>

      <div className="linha-entre">
        <span className="campo-ajuda">
          {usados === 0
            ? 'Nenhum campo: a fila inteira.'
            : `${usados} ${usados === 1 ? 'campo' : 'campos'} no filtro.`}
        </span>

        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <button type="button" className="btn -fantasma -sm" onClick={() => setRascunho({})}>
            Limpar
          </button>
          <button type="submit" className="btn -primario -sm">
            Aplicar
          </button>
        </div>
      </div>
    </form>
  );
}
