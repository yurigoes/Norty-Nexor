import { useCallback, useEffect, useState } from 'react';
import type { AssetView } from '@norty-desk/shared';
import { ROTULO_ATIVO } from '@norty-desk/shared';

import {
  ativosDoChamado,
  buscarAtivos,
  desvincularAtivo,
  vincularAtivo,
} from '../../api/ativos';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * Qual máquina é essa.
 *
 * Fica no trilho de propriedades, junto do resto do que descreve o
 * chamado. Vincular é `ativo:ler`: quem atende precisa dizer qual
 * equipamento é, mudar o cadastro dele é outra conversa.
 */
export function AtivosDoChamado({ ticketId }: { ticketId: string }) {
  const { can } = useAutenticacao();
  const [vinculados, setVinculados] = useState<AssetView[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<AssetView[]>([]);

  const recarregar = useCallback(async () => {
    setVinculados(await ativosDoChamado(ticketId));
  }, [ticketId]);

  useEffect(() => {
    void recarregar().catch(() => setVinculados([]));
  }, [recarregar]);

  useEffect(() => {
    if (!buscando) return;
    const alarme = setTimeout(() => {
      void buscarAtivos({ q: termo || undefined, limit: 8 })
        .then(setAchados)
        .catch(() => setAchados([]));
    }, 250);
    return () => clearTimeout(alarme);
  }, [termo, buscando]);

  if (!vinculados || !can('ativo:ler')) return null;

  return (
    <div className="pilha-sm">
      <div className="linha-entre" style={{ flexWrap: 'nowrap' }}>
        <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
          Equipamento
        </span>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setBuscando((b) => !b);
            setTermo('');
          }}
        >
          {buscando ? 'fechar' : '+ vincular'}
        </button>
      </div>

      {vinculados.length === 0 && !buscando ? (
        <span className="campo-ajuda">Nenhum.</span>
      ) : null}

      {vinculados.map((ativo) => (
        <div key={ativo.id} className="linha-entre" style={{ flexWrap: 'nowrap', gap: 'var(--e-2)' }}>
          <span style={{ fontSize: 'var(--t-corpo-sm)', minWidth: 0 }}>
            {ativo.name}
            <span className="campo-ajuda" style={{ display: 'block' }}>
              {ROTULO_ATIVO[ativo.kind]}
              {ativo.tag ? ` · ${ativo.tag}` : ''}
            </span>
          </span>
          <button
            type="button"
            className="btn-icone"
            aria-label={`Desvincular ${ativo.name}`}
            onClick={() => {
              void desvincularAtivo(ticketId, ativo.id).then(setVinculados);
            }}
          >
            ×
          </button>
        </div>
      ))}

      {buscando ? (
        <div className="pilha-sm">
          <input
            className="input"
            type="search"
            placeholder="Patrimônio, série ou nome"
            aria-label="Buscar equipamento"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />

          {achados
            .filter((a) => !vinculados.some((v) => v.id === a.id))
            .map((ativo) => (
              <button
                key={ativo.id}
                type="button"
                className="btn -secundario -sm"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => {
                  void vincularAtivo(ticketId, ativo.id).then((lista) => {
                    setVinculados(lista);
                    setBuscando(false);
                  });
                }}
              >
                {ativo.name}
                {ativo.tag ? ` · ${ativo.tag}` : ''}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
