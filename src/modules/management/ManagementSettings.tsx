import { useMemo, useState } from 'react';
import {
  Building2, Database, Layers, Network, RotateCcw, Settings, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { commonAreas } from '../../services/reservations';
import { gates } from '../../services/access';
import { towers } from '../../services/directory';
import { ROLE_LABEL, ROLE_PERMISSIONS, ROLE_DESCRIPTION } from '../../services/permissions';
import { getTrialInfo, journalSize, resetDemo, TRIAL_DAYS } from '../../data/db';
import type { UserRole } from '../../data/types';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, DetailList, PageHeader, ProgressBar, Switch,
  Tabs, useToast,
} from '../../components/ui';
import { currency, number } from '../../lib/format';
import { formatDate } from '../../lib/date';
import './management.css';

const ROADMAP = [
  ['Fase 1', 'MVP navegável', 'Design system, arquitetura, dados provisórios e todos os fluxos de demonstração.', true],
  ['Fase 2', 'Produção', 'Banco definitivo, autenticação real, API, permissões persistidas, logs e backup.', false],
  ['Fase 3', 'Financeiro', 'Boletos, PIX, integração bancária e conciliação automática.', false],
  ['Fase 4', 'Portaria e segurança', 'Controle de acesso físico, CFTV (ONVIF/RTSP), LPR e integração com equipamentos.', false],
  ['Fase 5', 'NEXOR AI', 'Concierge conectado a modelo de linguagem sobre os dados reais.', false],
  ['Fase 6', 'Marketplace', 'Prestadores, serviços e parceiros dentro da plataforma.', false],
] as const;

export function ManagementSettings() {
  const { condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const trial = getTrialInfo();

  const [tab, setTab] = useState('condominio');
  const [confirmReset, setConfirmReset] = useState(false);
  const [flags, setFlags] = useState({
    autoApprove: false, plateRecognition: true, pushNotifications: true,
    visitorQr: true, auditRetention: true, concierge: true,
  });

  const data = useMemo(() => ({
    areas: commonAreas(condominium.id),
    gateList: gates(condominium.id),
    towerList: towers(condominium.id),
  }), [condominium.id, dataVersion]);

  return (
    <>
      <PageHeader
        icon={<Settings size={22} />}
        title="Configurações"
        subtitle="Estrutura do condomínio, permissões, plataforma e roadmap"
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'condominio', label: 'Condomínio' },
              { id: 'permissoes', label: 'Permissões' },
              { id: 'plataforma', label: 'Plataforma' },
              { id: 'roadmap', label: 'Roadmap' },
            ]}
          />
        }
      />

      {tab === 'condominio' && (
        <div className="nx-settings-grid">
          <Card padding="md">
            <CardHeader title="Dados do condomínio" icon={<Building2 size={18} />} />
            <DetailList
              columns={1}
              items={[
                { label: 'Razão social', value: condominium.name },
                { label: 'CNPJ', value: condominium.document },
                { label: 'Endereço', value: `${condominium.address} — ${condominium.city}/${condominium.state}` },
                { label: 'CEP', value: condominium.zip },
                { label: 'Síndico(a)', value: condominium.managerName },
                { label: 'Na plataforma desde', value: formatDate(condominium.createdAt.slice(0, 10)) },
              ]}
            />
          </Card>

          <Card padding="md">
            <CardHeader title="Estrutura física" icon={<Layers size={18} />} />
            <DetailList
              columns={2}
              items={[
                { label: 'Torres', value: number(data.towerList.length) },
                { label: 'Unidades', value: number(condominium.unitsCount) },
                { label: 'Portarias', value: number(data.gateList.length) },
                { label: 'Áreas comuns', value: number(data.areas.length) },
                { label: 'Moradores', value: number(condominium.residentsCount) },
                { label: 'Funcionários', value: number(condominium.staffCount) },
              ]}
            />
            <div className="nx-stack nx-gap-2" style={{ marginTop: 'var(--space-5)' }}>
              {data.towerList.map((t) => (
                <div key={t.id} className="nx-gate-status">
                  <span className="nx-grow nx-medium">{t.name}</span>
                  <span className="nx-text-xs nx-text-subtle">{t.floors} andares · {number(t.unitsCount)} unidades</span>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title="Áreas comuns" subtitle="Regras de reserva por espaço" />
            <div className="nx-stack nx-gap-2">
              {data.areas.map((a) => (
                <div key={a.id} className="nx-gate-status">
                  <span className="nx-grow nx-medium">{a.name}</span>
                  <span className="nx-text-xs nx-text-subtle">{a.capacity} pessoas · {a.fee ? currency(a.fee) : 'sem taxa'}</span>
                  <Badge tone={a.autoApprove ? 'success' : 'warning'} size="sm">
                    {a.autoApprove ? 'Automática' : 'Manual'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'permissoes' && (
        <div className="nx-settings-grid">
          {(Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => (
            <Card key={role} padding="md">
              <CardHeader
                title={ROLE_LABEL[role]}
                subtitle={ROLE_DESCRIPTION[role]}
                icon={<ShieldCheck size={18} />}
                action={<Badge tone="brand" size="sm">{ROLE_PERMISSIONS[role].length} permissões</Badge>}
              />
              <div className="nx-perm-grid">
                {ROLE_PERMISSIONS[role].map((p) => <span key={p} className="nx-perm">{p}</span>)}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'plataforma' && (
        <div className="nx-settings-grid">
          <Card padding="md">
            <CardHeader title="Recursos da plataforma" icon={<Sparkles size={18} />} />
            <div className="nx-stack nx-gap-4">
              <Switch checked={flags.visitorQr} onChange={(v) => setFlags((f) => ({ ...f, visitorQr: v }))} label="Convites com QR Code" description="Gera código de validação para cada autorização de visitante." />
              <Switch checked={flags.plateRecognition} onChange={(v) => setFlags((f) => ({ ...f, plateRecognition: v }))} label="Reconhecimento de placa" description="Liberação automática de veículos cadastrados na garagem." />
              <Switch checked={flags.autoApprove} onChange={(v) => setFlags((f) => ({ ...f, autoApprove: v }))} label="Aprovação automática de reservas" description="Aplica a todas as áreas, ignorando a regra individual." />
              <Switch checked={flags.pushNotifications} onChange={(v) => setFlags((f) => ({ ...f, pushNotifications: v }))} label="Notificações push (PWA)" description="Alertas no celular para moradores e portaria." />
              <Switch checked={flags.concierge} onChange={(v) => setFlags((f) => ({ ...f, concierge: v }))} label="NEXOR AI · Concierge" description="Assistente disponível para moradores e gestão." />
              <Switch checked={flags.auditRetention} onChange={(v) => setFlags((f) => ({ ...f, auditRetention: v }))} label="Retenção estendida de auditoria" description="Mantém a trilha completa por 5 anos." />
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title="Ambiente de demonstração" icon={<Database size={18} />} />
            <div className="nx-stack nx-gap-4">
              <ProgressBar
                label={`Período de teste · ${trial.daysUsed} de ${TRIAL_DAYS} dias`}
                value={trial.daysUsed}
                max={TRIAL_DAYS}
                tone={trial.daysLeft < 7 ? 'warning' : 'brand'}
                showValue
              />
              <DetailList
                columns={2}
                items={[
                  { label: 'Início do teste', value: formatDate(trial.startedAt.slice(0, 10)) },
                  { label: 'Encerra em', value: formatDate(trial.endsAt.slice(0, 10)) },
                  { label: 'Alterações registradas', value: number(journalSize()) },
                  { label: 'Modo de dados', value: 'Provisório (seed + journal)' },
                ]}
              />
              <div className="nx-callout">
                <p className="nx-medium">Como os dados funcionam nesta fase</p>
                <p className="nx-text-sm nx-text-muted">
                  O condomínio é reconstruído de forma determinística a cada carregamento e apenas
                  as alterações da demonstração são persistidas no navegador. Reiniciar descarta o
                  histórico da demonstração e devolve o ambiente ao estado original.
                </p>
              </div>
              <Button variant="danger" icon={<RotateCcw size={16} />} onClick={() => setConfirmReset(true)}>
                Reiniciar demonstração
              </Button>
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title="Multi-tenant" icon={<Network size={18} />} />
            <p className="nx-text-sm nx-text-muted">
              Cada condomínio possui dados isolados dentro da administradora. Um usuário vinculado
              a um condomínio não enxerga dados de outro sem permissão explícita de portfólio.
            </p>
            <div className="nx-tenant-tree" style={{ marginTop: 'var(--space-4)' }}>
              <div className="nx-tenant-tree__root"><Users size={15} /> Administradora (tenant)</div>
              <ul>
                <li>Condomínio · dados, usuários e configurações próprios</li>
                <li>Torres, unidades e vagas</li>
                <li>Portarias e áreas comuns</li>
                <li>Veículos, visitantes e funcionários</li>
                <li>Financeiro, documentos e governança</li>
              </ul>
            </div>
          </Card>
        </div>
      )}

      {tab === 'roadmap' && (
        <Card padding="lg">
          <CardHeader title="Roadmap do produto" subtitle="Da demonstração à versão profissional" />
          <div className="nx-roadmap">
            {ROADMAP.map(([phase, title, description, current]) => (
              <div key={phase} className={`nx-roadmap__item ${current ? 'is-current' : ''}`}>
                <span className="nx-roadmap__phase">{phase.replace('Fase ', '')}</span>
                <div className="nx-grow">
                  <div className="nx-row nx-gap-2 nx-wrap">
                    <strong>{title}</strong>
                    {current && <Badge tone="success" size="sm">Entrega atual</Badge>}
                  </div>
                  <p className="nx-text-sm nx-text-muted" style={{ marginTop: 2 }}>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { resetDemo(); toast.success('Demonstração reiniciada'); window.location.reload(); }}
        title="Reiniciar demonstração"
        message="Todas as alterações feitas durante a demonstração serão descartadas. Deseja continuar?"
        confirmLabel="Reiniciar"
      />
    </>
  );
}
