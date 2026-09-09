import { useEffect, useState } from 'react';
import type { AuditEntry } from '@norty-desk/shared';

import { trilhaDeAuditoria } from '../../api/lote';
import { dataCurta } from '../../lib/formato';

const ENTIDADES = [
  { chave: '', rotulo: 'Tudo' },
  { chave: 'ChannelAccount', rotulo: 'Canais' },
  { chave: 'OutboundWebhook', rotulo: 'Webhooks' },
  { chave: 'Ticket', rotulo: 'Chamados' },
  { chave: 'Brand', rotulo: 'Marca' },
];

/**
 * A trilha de configuração.
 *
 * Responde "quem mexeu nisto, e o quê?" seis meses depois. Registra o
 * diff, não a linha inteira: dois campos alterados numa tabela de trinta
 * é o que se lê; o registro completo antes e depois vira um backup que
 * ninguém consulta.
 */
export function Auditoria() {
  const [entidade, setEntidade] = useState('');
  const [linhas, setLinhas] = useState<AuditEntry[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setLinhas(null);
    void trilhaDeAuditoria({ entity: entidade || undefined, limit: 200 })
      .then(setLinhas)
      .catch(() => setErro('Não foi possível carregar a trilha.'));
  }, [entidade]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Auditoria</h2>
          <p>
            Quem mudou o quê, e o que exatamente mudou. Segredo nunca entra aqui — nem o valor
            antigo.
          </p>
        </div>

        <select
          className="select -auto"
          aria-label="Filtrar por tipo"
          value={entidade}
          onChange={(e) => setEntidade(e.target.value)}
        >
          {ENTIDADES.map((e) => (
            <option key={e.chave} value={e.chave}>
              {e.rotulo}
            </option>
          ))}
        </select>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!linhas ? (
        <div className="sk sk-bloco" />
      ) : linhas.length === 0 ? (
        <div className="vazio">
          <h3>Nada registrado</h3>
          <p>Mudanças de configuração aparecem aqui assim que acontecerem.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>O quê</th>
                  <th>Mudou</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dataCurta(linha.createdAt)}</td>
                    <td>
                      {linha.actor?.name ?? 'Sistema'}
                      {linha.ip ? (
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          {linha.ip}
                        </span>
                      ) : null}
                    </td>
                    <td className="mono">{linha.action}</td>
                    <td>
                      {linha.diff ? (
                        <dl className="lista-definicao">
                          {Object.entries(linha.diff).map(([campo, valor]) => (
                            <div key={campo} className="lista-definicao-item">
                              <dt className="mono">{campo}</dt>
                              <dd>
                                <span className="suave">{formatar(valor.de)}</span>
                                {' → '}
                                <strong>{formatar(valor.para)}</strong>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <span className="campo-ajuda">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatar(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  return JSON.stringify(valor);
}
