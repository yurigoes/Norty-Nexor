import { useMemo, useState } from 'react';
import {
  Download,
  Filter,
  Flame,
  MessageSquare,
  Phone,
  Plus,
  UserPlus,
} from 'lucide-react';
import type { Lead, LeadStatus } from '@veyra/core';
import {
  AnelScore,
  Avatar,
  Botao,
  Busca,
  Cartao,
  EstadoVazio,
  Gaveta,
  Selecao,
  Selo,
  useAvisos,
} from '../components';
import { formatarMoeda, formatarNumero } from '../components/Charts';
import { BarraFiltros, Pagina, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_ORIGEM, ROTULO_STATUS_LEAD, ROTULO_TEMPERATURA } from '../app/rotulos';
import { LEADS, PIPELINES, produtoPorId, usuarioPorId } from '../data/base';

function tomDoStatus(status: LeadStatus) {
  if (status === 'venda') return 'sucesso' as const;
  if (status === 'perdido' || status === 'desistente') return 'perigo' as const;
  if (status === 'quente' || status === 'em_negociacao') return 'atencao' as const;
  if (status === 'sem_resposta' || status === 'nutricao') return 'neutro' as const;
  return 'info' as const;
}

/**
 * Leads
 *
 * A lista é a fila de trabalho, não um relatório. Por isso a ordenação
 * padrão é por score decrescente e a coluna "última interação" fica
 * visível: o que decide a próxima ligação é quem está quente e há quanto
 * tempo ninguém fala com a pessoa.
 */
export function Leads() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<'todos' | LeadStatus>('todos');
  const [temperatura, setTemperatura] = useState<'todas' | Lead['temperatura']>('todas');
  const [responsavel, setResponsavel] = useState('todos');
  const [selecionado, setSelecionado] = useState<Lead | null>(null);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return LEADS.filter((lead) => {
      if (status !== 'todos' && lead.status !== status) return false;
      if (temperatura !== 'todas' && lead.temperatura !== temperatura) return false;
      if (responsavel !== 'todos' && lead.responsavelId !== responsavel) return false;
      if (termo && !`${lead.nome} ${lead.telefone} ${lead.email ?? ''} ${lead.cidade ?? ''}`.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    }).sort((a, b) => b.score - a.score);
  }, [busca, status, temperatura, responsavel, versaoDados]);

  const potencial = filtrados.reduce((s, l) => s + (l.valorEstimado ?? 0), 0);

  return (
    <Pagina
      titulo="Leads"
      subtitulo="A fila de trabalho do comercial, ordenada por score. Quem está quente aparece primeiro."
      acoes={
        <>
          {pode('leads.exportar') && (
            <Botao variante="secundario" icone={Download} onClick={() => avisar({ tom: 'info', titulo: 'Exportação iniciada', texto: `${filtrados.length} leads em CSV. Você recebe o arquivo por e-mail.` })}>
              Exportar
            </Botao>
          )}
          {pode('leads.criar') && (
            <Botao variante="primario" icone={Plus} onClick={() => avisar({ tom: 'sucesso', titulo: 'Formulário de lead aberto' })}>
              Novo lead
            </Botao>
          )}
        </>
      }
    >
      <BarraFiltros>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Nome, telefone, e-mail ou cidade…" className="vy-grow" />
        <Selecao value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | 'todos')} style={{ width: 'auto' }} aria-label="Status">
          <option value="todos">Todos os status</option>
          {Object.entries(ROTULO_STATUS_LEAD).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </Selecao>
        <Selecao value={temperatura} onChange={(e) => setTemperatura(e.target.value as Lead['temperatura'] | 'todas')} style={{ width: 'auto' }} aria-label="Temperatura">
          <option value="todas">Qualquer temperatura</option>
          {Object.entries(ROTULO_TEMPERATURA).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </Selecao>
        <Selecao value={responsavel} onChange={(e) => setResponsavel(e.target.value)} style={{ width: 'auto' }} aria-label="Responsável">
          <option value="todos">Todos os responsáveis</option>
          {['u-julia', 'u-pedro', 'u-bianca'].map((id) => (
            <option key={id} value={id}>
              {usuarioPorId(id)?.nome}
            </option>
          ))}
        </Selecao>
        <span className="vy-row" style={{ gap: 'var(--space-2)', marginLeft: 'auto' }}>
          <Filter size={14} color="var(--text-subtle)" />
          <span className="vy-mono vy-muted">
            {formatarNumero(filtrados.length)} leads · {formatarMoeda(potencial, true)} em potencial
          </span>
        </span>
      </BarraFiltros>

      <Cartao>
        {filtrados.length === 0 ? (
          <EstadoVazio
            icone={UserPlus}
            titulo="Nenhum lead com esses filtros"
            texto="Ajuste os filtros ou limpe a busca. Se a origem parou de trazer lead, vale olhar a integração da campanha."
            acao={
              <Botao
                variante="secundario"
                onClick={() => {
                  setBusca('');
                  setStatus('todos');
                  setTemperatura('todas');
                  setResponsavel('todos');
                }}
              >
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <div className="vy-tabela-wrap">
            <table className="vy-tabela vy-tabela--clicavel">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Score</th>
                  <th>Lead</th>
                  <th>Produto</th>
                  <th>Status</th>
                  <th>Origem</th>
                  <th>Responsável</th>
                  <th className="vy-tabela__numero">Potencial</th>
                  <th>Última interação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelecionado(lead)}>
                    <td>
                      <AnelScore valor={lead.score} tamanho={38} />
                    </td>
                    <td>
                      <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-strong)' }}>{lead.nome}</span>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                        {lead.telefone} · {lead.cidade}/{lead.uf}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)' }}>{produtoPorId(lead.produtoId)?.nome ?? '—'}</span>
                    </td>
                    <td>
                      <Selo tom={tomDoStatus(lead.status)}>{ROTULO_STATUS_LEAD[lead.status]}</Selo>
                    </td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{ROTULO_ORIGEM[lead.origem]}</span>
                    </td>
                    <td>
                      {lead.responsavelId ? (
                        <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                          <Avatar nome={usuarioPorId(lead.responsavelId)?.nome ?? '—'} tamanho={24} cor={usuarioPorId(lead.responsavelId)?.avatarCor} />
                          <span style={{ fontSize: 'var(--text-xs)' }}>{usuarioPorId(lead.responsavelId)?.nome.split(' ')[0]}</span>
                        </span>
                      ) : (
                        <Selo tom="atencao">sem dono</Selo>
                      )}
                    </td>
                    <td className="vy-tabela__numero vy-numeric">{formatarMoeda(lead.valorEstimado ?? 0, true)}</td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{tempoRelativo(lead.ultimaInteracaoEm)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Gaveta aberta={!!selecionado} aoFechar={() => setSelecionado(null)} titulo={selecionado?.nome ?? ''} largura={480}>
        {selecionado && <DetalheLead lead={selecionado} />}
      </Gaveta>
    </Pagina>
  );
}

function DetalheLead({ lead }: { lead: Lead }) {
  const pipeline = PIPELINES.find((p) => p.id === lead.pipelineId);
  const etapa = pipeline?.etapas.find((e) => e.id === lead.etapaId);
  const responsavel = usuarioPorId(lead.responsavelId);

  return (
    <div className="vy-card__corpo vy-stack" style={{ gap: 'var(--space-5)' }}>
      <div className="vy-row" style={{ gap: 'var(--space-4)' }}>
        <AnelScore valor={lead.score} tamanho={62} />
        <div>
          <div className="vy-row" style={{ gap: 'var(--space-2)' }}>
            <Selo tom={tomDoStatus(lead.status)}>{ROTULO_STATUS_LEAD[lead.status]}</Selo>
            {(lead.temperatura === 'fervendo' || lead.temperatura === 'quente') && (
              <Selo tom="atencao">
                <Flame size={10} /> {ROTULO_TEMPERATURA[lead.temperatura]}
              </Selo>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {pipeline?.nome} · {etapa?.nome} · {formatarMoeda(lead.valorEstimado ?? 0)}
          </div>
        </div>
      </div>

      <div className="vy-row" style={{ gap: 'var(--space-2)' }}>
        <Botao variante="primario" icone={MessageSquare} bloco>
          Abrir conversa
        </Botao>
        <Botao variante="secundario" icone={Phone}>
          Ligar
        </Botao>
      </div>

      <Definicoes
        itens={[
          ['Telefone', lead.telefone],
          ['E-mail', lead.email ?? '—'],
          ['Cidade', `${lead.cidade}/${lead.uf}`],
          ['Origem', ROTULO_ORIGEM[lead.origem]],
          ['Campanha', lead.utm?.campaign ?? '—'],
          ['UTM', lead.utm ? `${lead.utm.source} · ${lead.utm.medium} · ${lead.utm.content}` : '—'],
          ['Produto', produtoPorId(lead.produtoId)?.nome ?? '—'],
          ['Responsável', responsavel?.nome ?? 'sem dono'],
          ['Criado', tempoRelativo(lead.createdAt)],
          ['Última interação', tempoRelativo(lead.ultimaInteracaoEm)],
          ['Próxima atividade', tempoRelativo(lead.proximaAtividadeEm)],
          ...(lead.motivoPerda ? ([['Motivo da perda', lead.motivoPerda]] as [string, string][]) : []),
        ]}
      />
    </div>
  );
}

export function Definicoes({ itens }: { itens: [string, string][] }) {
  return (
    <dl className="vy-stack" style={{ gap: 'var(--space-3)' }}>
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="vy-row-between" style={{ gap: 'var(--space-4)', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', flexShrink: 0 }}>{rotulo}</dt>
          <dd style={{ fontSize: 'var(--text-sm)', color: 'var(--text-default)', textAlign: 'right' }}>
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}
