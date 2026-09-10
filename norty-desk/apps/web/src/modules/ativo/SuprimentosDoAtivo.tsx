import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssetKind, SuprimentosDoAtivo } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { movimentarConsumivel, suprimentosDoAtivo } from '../../api/consumiveis';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

/**
 * Suprimentos da impressora: trocar o toner em um clique (vira uma saída
 * do estoque apontando para esta máquina) e ver o que ela já consumiu.
 * Em equipamento que não é impressora, só aparece se já recebeu algo.
 */
export function SuprimentosDoAtivoCard({ assetId, kind }: { assetId: string; kind: AssetKind }) {
  const { can } = useAutenticacao();
  const podeTirar = can('consumivel:movimentar');
  const [dados, setDados] = useState<SuprimentosDoAtivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => setDados(await suprimentosDoAtivo(assetId)), [assetId]);

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar os suprimentos.'));
  }, [carregar]);

  async function trocar(itemId: string, nome: string) {
    setOcupado(itemId);
    setErro(null);
    setAviso(null);
    try {
      await movimentarConsumivel(itemId, { kind: 'SAIDA', quantity: 1, assetId, note: 'Troca registrada na tela do equipamento' });
      setAviso(`Troca de ${nome} registrada — saiu 1 do estoque.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar a troca.');
    } finally {
      setOcupado(null);
    }
  }

  if (kind !== 'IMPRESSORA' && (!dados || dados.recent.length === 0)) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Suprimentos</h3>
          <p className="card-sub">Trocou o toner? Registre aqui: sai do estoque e fica no histórico da máquina.</p>
        </div>
      </div>
      <div className="card-corpo pilha-sm">
        {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}
        {aviso ? <div className="alerta-bloco -sucesso" role="status"><span>{aviso}</span></div> : null}

        {!dados ? (
          <div className="sk sk-linha" />
        ) : (
          <>
            {dados.compatible.length === 0 ? (
              <p className="campo-ajuda">
                Nenhum toner cadastrado. Cadastre em <Link to="/consumiveis">Consumíveis</Link> e marque o modelo desta impressora.
              </p>
            ) : (
              dados.compatible.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link to={`/consumiveis/${c.id}`}><strong>{c.name}</strong></Link>
                  {c.reference ? <span className="suave mono">{c.reference}</span> : null}
                  {c.belowMin ? <span className="selo -erro">{c.stock} {c.unit} em estoque</span> : <span className="suave">{c.stock} {c.unit} em estoque</span>}
                  {podeTirar ? (
                    <button type="button" className="btn -sm" disabled={ocupado !== null || c.stock <= 0} onClick={() => void trocar(c.id, c.name)}>
                      {ocupado === c.id ? 'Registrando…' : c.stock <= 0 ? 'Sem estoque' : 'Trocar'}
                    </button>
                  ) : null}
                </div>
              ))
            )}

            {dados.recent.length > 0 ? (
              <>
                <div className="divisor-texto"><span>Já recebeu</span></div>
                {dados.recent.map((m) => (
                  <div key={m.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="mono">{dataCurta(m.createdAt)}</span>
                    <Link to={`/consumiveis/${m.item.id}`}>{m.item.name}</Link>
                    <span className="suave">× {m.quantity}{m.author ? ` · ${m.author.name}` : ''}</span>
                  </div>
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
