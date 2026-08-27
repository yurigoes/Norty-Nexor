import { useMemo, useState } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import type { Lead, Pipeline } from '@veyra/core';
import { Avatar, Botao, Cartao, Segmentado, Selo, useAvisos } from '../components';
import { formatarMoeda, formatarNumero } from '../components/Charts';
import { Pagina, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { LEADS, PIPELINES, usuarioPorId } from '../data/base';
import './funil.css';

/**
 * Funil
 *
 * Kanban com uma coluna por etapa do pipeline escolhido. Cada segmento
 * tem seu próprio pipeline porque as etapas realmente diferem: seguro
 * passa por vistoria, saúde por declaração de saúde, consórcio por
 * análise de crédito. Forçar um funil único faria a etapa "documentação"
 * significar três coisas distintas.
 *
 * O topo da coluna soma o valor em jogo e mostra a probabilidade média
 * da etapa — é o que transforma a coluna em previsão, não em pilha.
 */
export function Funil() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [pipelineId, setPipelineId] = useState(PIPELINES[0].id);
  const [arrastando, setArrastando] = useState<string | null>(null);
  /* Movimentações locais da demonstração: leadId → etapaId. */
  const [movidos, setMovidos] = useState<Record<string, string>>({});

  const pipeline = PIPELINES.find((p) => p.id === pipelineId) as Pipeline;

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, Lead[]>();
    for (const etapa of pipeline.etapas) mapa.set(etapa.id, []);
    for (const lead of LEADS) {
      if (lead.pipelineId !== pipeline.id) continue;
      if (['perdido', 'desistente'].includes(lead.status)) continue;
      const etapaId = movidos[lead.id] ?? lead.etapaId;
      mapa.get(etapaId)?.push(lead);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => b.score - a.score);
    return mapa;
  }, [pipeline, movidos, versaoDados]);

  const previsao = useMemo(
    () =>
      pipeline.etapas.reduce((total, etapa) => {
        const valor = (porEtapa.get(etapa.id) ?? []).reduce((s, l) => s + (l.valorEstimado ?? 0), 0);
        return total + valor * etapa.probabilidade;
      }, 0),
    [pipeline, porEtapa],
  );

  function soltar(etapaId: string) {
    if (!arrastando) return;
    if (!pode('funil.editar')) {
      avisar({ tom: 'perigo', titulo: 'Sem permissão', texto: 'Seu papel não permite mover leads no funil.' });
      setArrastando(null);
      return;
    }
    const lead = LEADS.find((l) => l.id === arrastando);
    const etapa = pipeline.etapas.find((e) => e.id === etapaId);
    setMovidos((atual) => ({ ...atual, [arrastando]: etapaId }));
    setArrastando(null);
    avisar({ tom: 'sucesso', titulo: `${lead?.nome} → ${etapa?.nome}`, texto: 'Automação de mudança de etapa acionada.' });
  }

  return (
    <Pagina
      titulo="Funil de vendas"
      subtitulo="Cada segmento tem o próprio pipeline, porque as etapas realmente diferem entre consórcio, seguro e saúde."
      acoes={
        <>
          <Segmentado
            opcoes={PIPELINES.map((p) => ({ valor: p.id, rotulo: p.nome }))}
            valor={pipelineId}
            aoMudar={setPipelineId}
          />
          {pode('funil.criar') && (
            <Botao variante="secundario" icone={Plus}>
              Novo pipeline
            </Botao>
          )}
        </>
      }
    >
      <Cartao preenchido className="vy-row-between vy-wrap" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <div className="vy-eyebrow">Previsão ponderada</div>
          <strong className="vy-numeric" style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-strong)' }}>
            {formatarMoeda(previsao, true)}
          </strong>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, maxWidth: '60ch' }}>
            Soma do valor de cada lead multiplicado pela probabilidade histórica da etapa em que ele está. Não é o total do
            funil — é o que ele tende a virar receita.
          </p>
        </div>
        <div className="vy-row" style={{ gap: 'var(--space-6)' }}>
          <div>
            <div className="vy-eyebrow">Em jogo</div>
            <strong className="vy-numeric" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>
              {formatarMoeda(
                pipeline.etapas.reduce((t, e) => t + (porEtapa.get(e.id) ?? []).reduce((s, l) => s + (l.valorEstimado ?? 0), 0), 0),
                true,
              )}
            </strong>
          </div>
          <div>
            <div className="vy-eyebrow">Leads ativos</div>
            <strong className="vy-numeric" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>
              {formatarNumero(pipeline.etapas.reduce((t, e) => t + (porEtapa.get(e.id) ?? []).length, 0))}
            </strong>
          </div>
        </div>
      </Cartao>

      <div className="vy-funil vy-scroll-x">
        {pipeline.etapas.map((etapa) => {
          const leads = porEtapa.get(etapa.id) ?? [];
          const valor = leads.reduce((s, l) => s + (l.valorEstimado ?? 0), 0);
          return (
            <section
              key={etapa.id}
              className="vy-funil__coluna"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(etapa.id)}
              data-alvo={arrastando ? 'true' : 'false'}
            >
              <header className="vy-funil__cabecalho">
                <span className="vy-funil__faixa" style={{ background: etapa.cor }} />
                <div className="vy-row-between">
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{etapa.nome}</strong>
                  <span className="vy-mono vy-muted">{leads.length}</span>
                </div>
                <div className="vy-row-between" style={{ marginTop: 2 }}>
                  <span className="vy-numeric" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {formatarMoeda(valor, true)}
                  </span>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                    {Math.round(etapa.probabilidade * 100)}% histórico
                  </span>
                </div>
              </header>

              <div className="vy-funil__lista">
                {leads.map((lead) => (
                  <article
                    key={lead.id}
                    className="vy-funil__cartao"
                    draggable={pode('funil.editar')}
                    onDragStart={() => setArrastando(lead.id)}
                    onDragEnd={() => setArrastando(null)}
                    data-arrastando={arrastando === lead.id}
                  >
                    <div className="vy-row-between" style={{ gap: 'var(--space-2)' }}>
                      <strong className="vy-truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                        {lead.nome}
                      </strong>
                      <GripVertical size={13} color="var(--text-subtle)" style={{ flexShrink: 0 }} />
                    </div>
                    <div className="vy-numeric" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatarMoeda(lead.valorEstimado ?? 0, true)}
                    </div>
                    <div className="vy-row-between" style={{ marginTop: 'var(--space-3)' }}>
                      <span className="vy-row" style={{ gap: 5 }}>
                        {lead.responsavelId && (
                          <Avatar
                            nome={usuarioPorId(lead.responsavelId)?.nome ?? ''}
                            tamanho={20}
                            cor={usuarioPorId(lead.responsavelId)?.avatarCor}
                          />
                        )}
                        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                          {tempoRelativo(lead.ultimaInteracaoEm)}
                        </span>
                      </span>
                      {lead.score >= 80 && <Selo tom="atencao">{lead.score}</Selo>}
                    </div>
                  </article>
                ))}

                {leads.length === 0 && <p className="vy-funil__vazio">Nenhum lead nesta etapa.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </Pagina>
  );
}
