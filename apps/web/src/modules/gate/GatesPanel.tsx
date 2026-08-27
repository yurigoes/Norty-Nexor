import { useMemo, useState } from 'react';
import { KeyRound, Lock, Unlock } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { gates, openGate } from '../../services/access';
import {
  Badge, Button, Card, ConfirmDialog, PageHeader, StatusDot, useToast,
} from '../../components/ui';
import { formatDateTime } from '../../lib/date';
import type { Gate } from '../../data/types';
import './gate.css';

const KIND_LABEL: Record<Gate['kind'], string> = {
  principal: 'Acesso principal de pedestres e visitantes',
  garagem: 'Entrada e saída de veículos',
  servico: 'Prestadores, entregas e funcionários',
  pedestre: 'Acesso secundário de pedestres',
};

export function GatesPanel() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const [confirming, setConfirming] = useState<Gate | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const list = useMemo(() => gates(condominium.id), [condominium.id, dataVersion]);

  const trigger = (gate: Gate) => {
    setOpening(gate.id);
    window.setTimeout(() => {
      openGate(gate.id, user.name);
      setOpening(null);
      toast.success('Portão acionado', `${gate.name} aberto por ${user.name}.`);
    }, 900);
  };

  return (
    <>
      <PageHeader
        icon={<KeyRound size={22} />}
        title="Portões"
        subtitle="Acionamento remoto e status do perímetro"
        actions={<Badge tone="warning">Integração com controladoras prevista para a Fase 4</Badge>}
      />

      <div className="nx-gates-grid">
        {list.map((gate) => (
          <Card key={gate.id} padding="md">
            <div className="nx-gate-card">
              <div className="nx-row nx-between nx-gap-3">
                <div className="nx-row nx-gap-3">
                  <StatusDot
                    tone={gate.status === 'online' ? 'success' : gate.status === 'manutencao' ? 'warning' : 'danger'}
                    pulse={gate.status === 'online'}
                  />
                  <div>
                    <h3 className="nx-card__title">{gate.name}</h3>
                    <p className="nx-text-xs nx-text-subtle">{KIND_LABEL[gate.kind]}</p>
                  </div>
                </div>
                <Badge tone={gate.status === 'online' ? 'success' : gate.status === 'manutencao' ? 'warning' : 'danger'} size="sm">
                  {gate.status === 'online' ? 'Online' : gate.status === 'manutencao' ? 'Manutenção' : 'Offline'}
                </Badge>
              </div>

              <div className="nx-gate-info">
                <span>Última abertura</span>
                <strong>{gate.lastOpenedAt ? formatDateTime(gate.lastOpenedAt) : '—'}</strong>
                <span>Acionado por</span>
                <strong>{gate.lastOpenedBy ?? '—'}</strong>
              </div>

              <Button
                variant={gate.status === 'online' ? 'primary' : 'secondary'}
                size="xl"
                block
                className="nx-gate-card__open"
                disabled={gate.status !== 'online'}
                loading={opening === gate.id}
                icon={gate.status === 'online' ? <Unlock size={20} /> : <Lock size={20} />}
                onClick={() => setConfirming(gate)}
              >
                {gate.status === 'online' ? 'Abrir portão' : 'Indisponível'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card padding="md" style={{ marginTop: 'var(--space-5)' }}>
        <p className="nx-medium">Registro de acionamentos</p>
        <p className="nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-1)' }}>
          Toda abertura de portão é registrada na trilha de auditoria com autor, portão e horário —
          inclusive as acionadas automaticamente por leitura de placa.
        </p>
      </Card>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && trigger(confirming)}
        title="Abrir portão"
        message={`Confirma a abertura do ${confirming?.name}? A ação será registrada na auditoria.`}
        confirmLabel="Abrir agora"
        tone="primary"
      />
    </>
  );
}
