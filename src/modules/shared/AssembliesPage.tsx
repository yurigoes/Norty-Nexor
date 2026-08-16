import { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Gavel, MapPin, Users, Vote } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  ASSEMBLY_STATUS_LABEL, assemblies, castVote, hasVoted, voteTally, VoteError,
} from '../../services/communication';
import { unitLabel, units } from '../../services/directory';
import type { Assembly } from '../../data/types';
import {
  Badge, Card, EmptyState, PageHeader, ProgressBar, Tabs, useToast,
} from '../../components/ui';
import { formatLongDate, isoDate } from '../../lib/date';
import { number, percent } from '../../lib/format';
import './shared.css';

export function AssembliesPage() {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const canVote = can('assemblies.vote') && !!user.unitId;

  const list = useMemo(() => assemblies(condominium.id), [condominium.id, dataVersion]);
  const totalUnits = useMemo(() => units(condominium.id).filter((u) => u.status !== 'vaga').length, [condominium.id, dataVersion]);

  const today = isoDate(new Date());
  const active = list.filter((a) => a.status !== 'encerrada' && a.date >= today);
  const closed = list.filter((a) => a.status === 'encerrada' || a.date < today);

  const [tab, setTab] = useState('ativas');
  const rows = tab === 'ativas' ? active : closed;

  const vote = (assembly: Assembly, agendaItemId: string, option: string) => {
    if (!user.unitId) return;
    try {
      castVote(assembly.id, agendaItemId, user.unitId, user.name, option);
      toast.success('Voto registrado', `${unitLabel(user.unitId)} · ${option}`);
    } catch (err) {
      toast.error('Não foi possível votar', err instanceof VoteError ? err.message : 'Tente novamente.');
    }
  };

  return (
    <>
      <PageHeader
        icon={<Gavel size={22} />}
        title="Assembleias"
        subtitle="Convocações, pautas e votação digital"
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'ativas', label: 'Ativas', count: active.length },
              { id: 'encerradas', label: 'Encerradas', count: closed.length },
            ]}
          />
        }
      />

      {rows.length === 0 ? (
        <Card padding="md">
          <EmptyState icon={<Gavel size={24} />} title="Nenhuma assembleia" description="As convocações aparecerão aqui assim que forem publicadas." />
        </Card>
      ) : (
        <div className="nx-stack nx-gap-5">
          {rows.map((assembly) => {
            const participation = assembly.agenda[0]?.votes.length ?? 0;
            const quorum = totalUnits ? (participation / totalUnits) * 100 : 0;
            return (
              <Card key={assembly.id} padding="lg">
                <div className="nx-row nx-between nx-gap-4 nx-wrap">
                  <div>
                    <div className="nx-row nx-gap-2 nx-wrap" style={{ marginBottom: 'var(--space-2)' }}>
                      <Badge tone={assembly.status === 'em_votacao' ? 'success' : assembly.status === 'agendada' ? 'warning' : 'neutral'}>
                        {ASSEMBLY_STATUS_LABEL[assembly.status]}
                      </Badge>
                      <Badge tone="neutral">{assembly.kind === 'ordinaria' ? 'Ordinária' : 'Extraordinária'}</Badge>
                    </div>
                    <h2 style={{ fontSize: 'var(--text-xl)' }}>{assembly.title}</h2>
                    <div className="nx-row nx-gap-4 nx-wrap nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-2)' }}>
                      <span className="nx-row nx-gap-1"><CalendarClock size={14} /> {formatLongDate(assembly.date)} · {assembly.time}</span>
                      <span className="nx-row nx-gap-1"><MapPin size={14} /> {assembly.location}</span>
                    </div>
                  </div>

                  <div className="nx-quorum">
                    <p className="nx-uppercase nx-text-subtle">Quórum</p>
                    <strong>{percent(quorum)}</strong>
                    <ProgressBar
                      value={quorum}
                      tone={quorum >= assembly.quorumRequired ? 'success' : 'warning'}
                      size="sm"
                    />
                    <span className="nx-text-xs nx-text-subtle">
                      {number(participation)} de {number(totalUnits)} unidades · mínimo {assembly.quorumRequired}%
                    </span>
                  </div>
                </div>

                <div className="nx-assembly-agenda" style={{ marginTop: 'var(--space-6)' }}>
                  {assembly.agenda.map((item) => {
                    const tally = voteTally(item);
                    const voted = user.unitId ? hasVoted(assembly.id, item.id, user.unitId) : false;
                    const myVote = user.unitId ? item.votes.find((v) => v.unitId === user.unitId)?.option : undefined;
                    const canVoteNow = canVote && assembly.status === 'em_votacao' && !voted;

                    return (
                      <div key={item.id} className="nx-agenda-item">
                        <div className="nx-row-top nx-gap-3">
                          <span className="nx-agenda-item__order">{item.order}</span>
                          <div className="nx-grow">
                            <h3 className="nx-card__title">{item.title}</h3>
                            <p className="nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-2)' }}>{item.description}</p>
                          </div>
                          {voted && (
                            <Badge tone="success" size="sm" icon={<CheckCircle2 size={12} />}>Voto: {myVote}</Badge>
                          )}
                        </div>

                        {canVoteNow ? (
                          <div className="nx-vote-options">
                            {item.options.map((option) => (
                              <button key={option} className="nx-vote-option" onClick={() => vote(assembly, item.id, option)}>
                                {option}
                              </button>
                            ))}
                          </div>
                        ) : assembly.status === 'agendada' ? (
                          <p className="nx-text-sm nx-text-subtle" style={{ marginTop: 'var(--space-4)' }}>
                            A votação será aberta no dia da assembleia.
                          </p>
                        ) : null}

                        {item.votes.length > 0 && (
                          <div className="nx-tally">
                            <p className="nx-uppercase nx-text-subtle">
                              <Vote size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                              Apuração parcial · {number(item.votes.length)} votos
                            </p>
                            {tally.map((t) => (
                              <div key={t.option} className="nx-tally__row">
                                <div className="nx-tally__head">
                                  <span className="nx-medium">{t.option}</span>
                                  <span className="nx-text-muted nx-nums">{number(t.count)} · {percent(t.percent)}</span>
                                </div>
                                <ProgressBar
                                  value={t.percent}
                                  tone={t.option.startsWith('Aprovar') || t.option.startsWith('Chapa Renov') ? 'success' : t.option === 'Rejeitar' ? 'danger' : 'brand'}
                                  size="sm"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!canVote && assembly.status === 'em_votacao' && (
                  <p className="nx-text-sm nx-text-subtle" style={{ marginTop: 'var(--space-5)' }}>
                    <Users size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -2 }} />
                    Apenas unidades com representante cadastrado podem votar. O acompanhamento da apuração é aberto a todos.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
