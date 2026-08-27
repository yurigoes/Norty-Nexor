import { Flame, MessageSquare, Phone, Sparkles } from 'lucide-react';
import type { Lead } from '@veyra/core';
import { AnelScore, Avatar, Botao, Modal, Progresso, Selo, useAvisos } from '../components';
import { formatarMoeda, formatarPercentual } from '../components/Charts';
import { ROTULO_ORIGEM, ROTULO_STATUS_LEAD, ROTULO_TEMPERATURA } from '../app/rotulos';
import { tempoRelativo } from './Pagina';
import { PIPELINES, PREVISOES, produtoPorId, usuarioPorId } from '../data/base';

export function tomDoStatus(status: Lead['status']) {
  if (status === 'venda') return 'sucesso' as const;
  if (status === 'perdido' || status === 'desistente') return 'perigo' as const;
  if (status === 'quente' || status === 'em_negociacao') return 'atencao' as const;
  if (status === 'sem_resposta' || status === 'nutricao') return 'neutro' as const;
  return 'info' as const;
}

/**
 * Ficha do contato
 *
 * A mesma ficha aparece na gaveta da lista e no modal do funil. Ela
 * existe separada porque duplicá-la faria as duas telas divergirem no
 * primeiro campo novo — e a pergunta que ela responde é a mesma nos dois
 * lugares: quem é essa pessoa e qual é a próxima ação.
 */
export function FichaLead({ lead }: { lead: Lead }) {
  const pipeline = PIPELINES.find((p) => p.id === lead.pipelineId);
  const etapa = pipeline?.etapas.find((e) => e.id === lead.etapaId);
  const responsavel = usuarioPorId(lead.responsavelId);
  const previsao = PREVISOES.find((p) => p.leadId === lead.id);
  const quente = lead.temperatura === 'fervendo' || lead.temperatura === 'quente';

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <div className="vy-row" style={{ gap: 'var(--space-4)' }}>
        <AnelScore valor={lead.score} tamanho={62} />
        <div className="vy-grow" style={{ minWidth: 0 }}>
          <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
            <Selo tom={tomDoStatus(lead.status)}>{ROTULO_STATUS_LEAD[lead.status]}</Selo>
            {quente && (
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

      {/* A etapa carrega uma probabilidade histórica. Mostrá-la aqui evita
          que o vendedor trate como certo o que o funil trata como 30%. */}
      {etapa && (
        <div>
          <div className="vy-row-between" style={{ marginBottom: 5 }}>
            <span className="vy-eyebrow">Probabilidade histórica da etapa</span>
            <span className="vy-mono vy-muted">{formatarPercentual(etapa.probabilidade * 100, 0)}</span>
          </div>
          <Progresso valor={etapa.probabilidade * 100} />
        </div>
      )}

      {previsao && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--vy-gradient-soft)',
            border: '1px solid rgb(113 87 255 / 0.24)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="vy-row" style={{ gap: 6, marginBottom: 4 }}>
            <Sparkles size={12} color="var(--vy-violet-400)" />
            <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-strong)' }}>
              VEYRA Intelligence · {formatarPercentual(previsao.probabilidadeFechamento * 100, 0)} de chance
            </strong>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
            {previsao.recomendacao}
          </p>
        </div>
      )}

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
          ['Cidade', lead.cidade ? `${lead.cidade}/${lead.uf}` : '—'],
          ['Origem', ROTULO_ORIGEM[lead.origem]],
          ['Campanha', lead.utm?.campaign ?? '—'],
          ['UTM', lead.utm ? `${lead.utm.source} · ${lead.utm.medium} · ${lead.utm.content}` : '—'],
          ['Produto', produtoPorId(lead.produtoId)?.nome ?? '—'],
          ['Responsável', responsavel?.nome ?? 'sem dono'],
          ['Criado', tempoRelativo(lead.createdAt)],
          ['Última interação', tempoRelativo(lead.ultimaInteracaoEm)],
          ['Próxima atividade', tempoRelativo(lead.proximaAtividadeEm)],
          ...(lead.observacoes ? ([['Observações', lead.observacoes]] as [string, string][]) : []),
          ...(lead.motivoPerda ? ([['Motivo da perda', lead.motivoPerda]] as [string, string][]) : []),
        ]}
      />
    </div>
  );
}

/** A mesma ficha, dentro de um modal — usada pelo funil. */
export function ModalLead({
  lead,
  aoFechar,
}: {
  lead: Lead | null;
  aoFechar: () => void;
}) {
  const { avisar } = useAvisos();
  if (!lead) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura={540}
      titulo={lead.nome}
      descricao={`${lead.telefone}${lead.cidade ? ` · ${lead.cidade}/${lead.uf}` : ''}`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => avisar({ tom: 'info', titulo: 'Edição do lead', texto: 'Abrindo o cadastro completo.' })}
          >
            Editar cadastro
          </Botao>
        </>
      }
    >
      <FichaLead lead={lead} />
    </Modal>
  );
}

export function Definicoes({ itens }: { itens: [string, string][] }) {
  return (
    <dl className="vy-stack" style={{ gap: 'var(--space-3)' }}>
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="vy-row-between" style={{ gap: 'var(--space-4)', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', flexShrink: 0 }}>{rotulo}</dt>
          <dd style={{ fontSize: 'var(--text-sm)', color: 'var(--text-default)', textAlign: 'right' }}>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Cabeçalho compacto de pessoa, reaproveitado em listas e modais. */
export function LinhaPessoa({ nome, detalhe, cor }: { nome: string; detalhe?: string; cor?: string }) {
  return (
    <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
      <Avatar nome={nome} tamanho={26} cor={cor} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-strong)' }}>{nome}</span>
        {detalhe && (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{detalhe}</span>
        )}
      </span>
    </span>
  );
}
