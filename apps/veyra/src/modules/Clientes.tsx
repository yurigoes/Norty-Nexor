import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Calculator,
  FileSignature,
  FileText,
  LifeBuoy,
  MessageSquare,
  Phone,
  Star,
  Users,
} from 'lucide-react';
import type { TimelineChannel } from '@veyra/core';
import { Abas, Avatar, Botao, Busca, Cartao, CartaoCabecalho, CartaoCorpo, EstadoVazio, Selo } from '../components';
import { Indicador, formatarMoeda, formatarNumero } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_METODO } from '../app/rotulos';
import {
  CHAMADOS,
  CLIENTES,
  CONTRATOS,
  CONVERSAS,
  COTACOES,
  FATURAS,
  LINHA_DO_TEMPO,
  PROPOSTAS,
  clientePorId,
  produtoPorId,
  usuarioPorId,
} from '../data/base';

export function Clientes() {
  const { versaoDados } = useSessao();
  const [busca, setBusca] = useState('');

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return CLIENTES.filter((c) => !t || `${c.nome} ${c.documento} ${c.cidade} ${c.tags.join(' ')}`.toLowerCase().includes(t));
  }, [busca, versaoDados]);

  const carteira = CLIENTES.reduce((s, c) => s + c.valorVitalicio, 0);

  return (
    <Pagina titulo="Clientes" subtitulo="Cada cliente tem uma página só: contratos, financeiro, conversas e chamados na mesma linha do tempo.">
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Clientes ativos" valor={formatarNumero(CLIENTES.length)} icone={Users} />
        <Indicador rotulo="Valor vitalício da carteira" valor={formatarMoeda(carteira, true)} icone={Banknote} />
        <Indicador
          rotulo="Ticket médio por cliente"
          valor={formatarMoeda(carteira / CLIENTES.length, true)}
          icone={Calculator}
        />
        <Indicador
          rotulo="CSAT médio da base"
          valor={formatarNumero(CLIENTES.reduce((s, c) => s + (c.csatMedio ?? 0), 0) / CLIENTES.length, 1)}
          icone={Star}
        />
      </div>

      <Busca valor={busca} aoMudar={setBusca} placeholder="Nome, documento, cidade ou tag…" className="vy-grow" />

      <div style={{ marginTop: 'var(--space-4)' }}>
        {filtrados.length === 0 ? (
          <Cartao>
            <EstadoVazio icone={Users} titulo="Nenhum cliente encontrado" texto="Refine a busca ou verifique se o cadastro está com o documento correto." />
          </Cartao>
        ) : (
          <div className="vy-grid-2">
            {filtrados.map((cliente) => {
              const contratos = CONTRATOS.filter((c) => c.clienteId === cliente.id);
              return (
                <Link key={cliente.id} to={`/app/clientes/${cliente.id}`} style={{ textDecoration: 'none' }}>
                  <Cartao preenchido interativo>
                    <div className="vy-row" style={{ gap: 'var(--space-3)' }}>
                      <Avatar nome={cliente.nome} tamanho={42} />
                      <div className="vy-grow" style={{ minWidth: 0 }}>
                        <strong className="vy-truncate" style={{ display: 'block', color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>
                          {cliente.nome}
                        </strong>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {cliente.documento} · {cliente.cidade}/{cliente.uf}
                        </span>
                      </div>
                      <Selo tom="neutro">{cliente.tipo === 'pj' ? 'PJ' : 'PF'}</Selo>
                    </div>

                    <div className="vy-row-between" style={{ marginTop: 'var(--space-4)' }}>
                      <span>
                        <span className="vy-eyebrow" style={{ display: 'block' }}>
                          Valor vitalício
                        </span>
                        <strong className="vy-numeric" style={{ color: 'var(--text-strong)' }}>
                          {formatarMoeda(cliente.valorVitalicio, true)}
                        </strong>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <span className="vy-eyebrow" style={{ display: 'block' }}>
                          Contratos
                        </span>
                        <strong className="vy-numeric" style={{ color: 'var(--text-strong)' }}>
                          {contratos.length}
                        </strong>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <span className="vy-eyebrow" style={{ display: 'block' }}>
                          CSAT
                        </span>
                        <strong className="vy-numeric" style={{ color: (cliente.csatMedio ?? 5) < 3.5 ? 'var(--danger)' : 'var(--text-strong)' }}>
                          {cliente.csatMedio ? formatarNumero(cliente.csatMedio, 1) : '—'}
                        </strong>
                      </span>
                    </div>

                    {cliente.tags.length > 0 && (
                      <ul className="vy-row vy-wrap" style={{ gap: 5, marginTop: 'var(--space-3)' }}>
                        {cliente.tags.map((tag) => (
                          <li key={tag}>
                            <Selo tom={tag === 'atenção' ? 'perigo' : 'neutro'}>{tag}</Selo>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Cartao>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Pagina>
  );
}

/* =========================================================
   Cliente 360°
   A promessa da tela é simples: nenhuma pergunta sobre este
   cliente exige abrir outra aba. Por isso a linha do tempo
   mistura canais — WhatsApp, e-mail, cotação, pagamento e
   chamado aparecem juntos, em ordem, porque foi assim que o
   relacionamento aconteceu.
   ========================================================= */

const ICONE_CANAL: Record<TimelineChannel, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  email: FileText,
  ligacao: Phone,
  nota: FileText,
  sistema: FileSignature,
  cotacao: Calculator,
  proposta: FileText,
  pagamento: Banknote,
  chamado: LifeBuoy,
  ia: Star,
};

type AbaCliente = 'timeline' | 'contratos' | 'financeiro' | 'atendimento';

export function Cliente360() {
  const { id } = useParams();
  const [aba, setAba] = useState<AbaCliente>('timeline');
  const cliente = clientePorId(id);

  if (!cliente) {
    return (
      <Cartao>
        <EstadoVazio
          icone={Users}
          titulo="Cliente não encontrado"
          texto="O identificador informado não corresponde a nenhum cliente desta organização."
          acao={
            <Link to="/app/clientes">
              <Botao variante="secundario" icone={ArrowLeft}>
                Voltar para clientes
              </Botao>
            </Link>
          }
        />
      </Cartao>
    );
  }

  const contratos = CONTRATOS.filter((c) => c.clienteId === cliente.id);
  const faturas = FATURAS.filter((f) => f.clienteId === cliente.id);
  const chamados = CHAMADOS.filter((t) => t.clienteId === cliente.id);
  const conversas = CONVERSAS.filter((c) => c.clienteId === cliente.id);
  const propostas = PROPOSTAS.filter((p) => p.clienteId === cliente.id);
  const cotacoes = COTACOES.filter((c) => c.clienteId === cliente.id);
  const eventos = LINHA_DO_TEMPO.filter((e) => e.clienteId === cliente.id).sort((a, b) => (a.em < b.em ? 1 : -1));

  const emAberto = faturas.filter((f) => f.status !== 'pago' && f.status !== 'cancelado').reduce((s, f) => s + f.valor, 0);

  return (
    <Pagina
      titulo={cliente.nome}
      subtitulo={`${cliente.documento} · ${cliente.cidade}/${cliente.uf} · cliente desde ${formatarData(cliente.desde)}`}
      acoes={
        <>
          <Link to="/app/clientes">
            <Botao variante="fantasma" icone={ArrowLeft}>
              Clientes
            </Botao>
          </Link>
          <Botao variante="secundario" icone={Phone}>
            Ligar
          </Botao>
          <Botao variante="primario" icone={MessageSquare}>
            Abrir conversa
          </Botao>
        </>
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Valor vitalício" valor={formatarMoeda(cliente.valorVitalicio, true)} icone={Banknote} />
        <Indicador rotulo="Em aberto" valor={formatarMoeda(emAberto, true)} contexto={`${faturas.filter((f) => f.status !== 'pago').length} faturas`} icone={FileText} />
        <Indicador rotulo="Contratos vigentes" valor={formatarNumero(contratos.filter((c) => c.status === 'vigente').length)} icone={FileSignature} />
        <Indicador rotulo="CSAT" valor={cliente.csatMedio ? formatarNumero(cliente.csatMedio, 1) : '—'} contexto={`${chamados.length} chamados`} icone={Star} />
      </div>

      <Abas
        opcoes={[
          { valor: 'timeline' as const, rotulo: 'Linha do tempo' },
          { valor: 'contratos' as const, rotulo: `Contratos (${contratos.length})` },
          { valor: 'financeiro' as const, rotulo: `Financeiro (${faturas.length})` },
          { valor: 'atendimento' as const, rotulo: `Atendimento (${chamados.length})` },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      <div style={{ marginTop: 'var(--space-5)' }}>
        {aba === 'timeline' && (
          <div className="vy-grid-2">
            <Cartao>
              <CartaoCabecalho titulo="Tudo que aconteceu" descricao="Todos os canais na mesma linha, em ordem cronológica." />
              <CartaoCorpo>
                {eventos.length === 0 ? (
                  <EstadoVazio titulo="Sem histórico ainda" texto="Assim que houver conversa, cotação ou pagamento, tudo aparece aqui." />
                ) : (
                  <ol className="vy-timeline">
                    {eventos.map((evento) => {
                      const Icone = ICONE_CANAL[evento.canal];
                      return (
                        <li key={evento.id} className="vy-timeline__item">
                          <span className="vy-timeline__ponto">
                            <Icone size={7} color="var(--text-muted)" />
                          </span>
                          <div className="vy-row-between" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{evento.titulo}</strong>
                            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)', flexShrink: 0 }}>
                              {tempoRelativo(evento.em)}
                            </span>
                          </div>
                          {evento.descricao && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{evento.descricao}</p>
                          )}
                          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{evento.autor}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CartaoCorpo>
            </Cartao>

            <div className="vy-stack">
              <Cartao>
                <CartaoCabecalho titulo="Cadastro" />
                <CartaoCorpo>
                  <dl className="vy-stack" style={{ gap: 'var(--space-3)' }}>
                    {(
                      [
                        ['Documento', cliente.documento],
                        ['Tipo', cliente.tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'],
                        ['Telefone', cliente.telefone],
                        ['E-mail', cliente.email ?? '—'],
                        ['Cidade', `${cliente.cidade}/${cliente.uf}`],
                        ['Responsável', usuarioPorId(cliente.responsavelId)?.nome ?? '—'],
                        ['Cotações', String(cotacoes.length)],
                        ['Propostas', String(propostas.length)],
                        ['Conversas', String(conversas.length)],
                      ] as [string, string][]
                    ).map(([r, v]) => (
                      <div key={r} className="vy-row-between" style={{ alignItems: 'baseline', gap: 'var(--space-3)' }}>
                        <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{r}</dt>
                        <dd style={{ fontSize: 'var(--text-sm)', color: 'var(--text-default)', textAlign: 'right' }}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CartaoCorpo>
              </Cartao>

              <Cartao>
                <CartaoCabecalho titulo="Marcadores" descricao="Usados na segmentação de campanha." />
                <CartaoCorpo>
                  <ul className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
                    {cliente.tags.map((tag) => (
                      <li key={tag}>
                        <Selo tom="info">{tag}</Selo>
                      </li>
                    ))}
                  </ul>
                </CartaoCorpo>
              </Cartao>
            </div>
          </div>
        )}

        {aba === 'contratos' && (
          <div className="vy-stack">
            {contratos.map((contrato) => (
              <Cartao key={contrato.id} preenchido>
                <div className="vy-row-between vy-wrap" style={{ gap: 'var(--space-4)' }}>
                  <div>
                    <span className="vy-mono">{contrato.numero}</span>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600, marginTop: 4 }}>
                      {produtoPorId(contrato.produtoId)?.nome}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Selo tom={contrato.status === 'vigente' ? 'sucesso' : contrato.status === 'renovacao' ? 'info' : 'atencao'}>
                      {contrato.status}
                    </Selo>
                    <div className="vy-numeric" style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
                      {formatarMoeda(contrato.valor, true)}
                    </div>
                  </div>
                </div>
              </Cartao>
            ))}
          </div>
        )}

        {aba === 'financeiro' && (
          <Cartao>
            <div className="vy-tabela-wrap">
              <table className="vy-tabela">
                <thead>
                  <tr>
                    <th>Fatura</th>
                    <th>Descrição</th>
                    <th>Vencimento</th>
                    <th>Método</th>
                    <th className="vy-tabela__numero">Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {faturas.map((fatura) => (
                    <tr key={fatura.id}>
                      <td className="vy-mono">{fatura.numero}</td>
                      <td>{fatura.descricao}</td>
                      <td>{formatarData(fatura.vencimento)}</td>
                      <td>{fatura.metodo ? ROTULO_METODO[fatura.metodo] : '—'}</td>
                      <td className="vy-tabela__numero vy-numeric">{formatarMoeda(fatura.valor)}</td>
                      <td>
                        <Selo tom={fatura.status === 'pago' ? 'sucesso' : fatura.status === 'vencido' ? 'perigo' : 'atencao'}>
                          {fatura.status}
                        </Selo>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        )}

        {aba === 'atendimento' && (
          <div className="vy-stack">
            {chamados.length === 0 ? (
              <Cartao>
                <EstadoVazio icone={LifeBuoy} titulo="Nenhum chamado" texto="Este cliente nunca precisou abrir um protocolo." />
              </Cartao>
            ) : (
              chamados.map((chamado) => (
                <Cartao key={chamado.id} preenchido>
                  <div className="vy-row-between vy-wrap" style={{ gap: 'var(--space-4)' }}>
                    <div>
                      <span className="vy-mono">{chamado.protocolo}</span>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600, marginTop: 4 }}>
                        {chamado.assunto}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {chamado.categoria} · aberto {tempoRelativo(chamado.abertoEm)}
                      </div>
                    </div>
                    <div className="vy-row" style={{ gap: 'var(--space-2)' }}>
                      {chamado.slaViolado && <Selo tom="perigo">SLA violado</Selo>}
                      <Selo tom={['resolvido', 'encerrado'].includes(chamado.status) ? 'sucesso' : 'info'}>
                        {chamado.status.replace('_', ' ')}
                      </Selo>
                    </div>
                  </div>
                  {chamado.solucao && (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>{chamado.solucao}</p>
                  )}
                </Cartao>
              ))
            )}
          </div>
        )}
      </div>
    </Pagina>
  );
}
