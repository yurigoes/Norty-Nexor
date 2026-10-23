import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { MODULE_LABEL, MOVEMENT_TYPE_LABEL, type ModuleKey } from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Switch } from '../../components/form';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date } from '../../lib/format';
import { Status } from '../../components/status';

interface OrgProfile {
  id: string; name: string; legalName: string | null; document: string | null; slug: string; email: string | null; phone: string | null;
  status: string; timezone: string;
  settings: {
    turnaroundHours: number; blockExpiredCnh: boolean; documentAlertDays: number; requireVehicleFor: string[]; requireWorkOrderFor: string[];
    annualDepreciationPercent: number | null; lateFeePercent: number; monthlyInterestPercent: number; requestExpiryHours: number;
    notificationChannels: { email: boolean; whatsapp: boolean; webhook: boolean };
  };
  plan: { code: string; name: string; status: string; trialEndsAt: string | null; maxVehicles: number | null; maxBranches: number | null; maxUsers: number | null } | null;
  enabledModules: ModuleKey[];
  usage: { branches: number; users: number; vehicles: number };
}

const OUT_TYPES = ['MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT', 'LOSS'] as const;

export function SettingsPage() {
  const toast = useToast();
  const org = useApi(() => api.get<OrgProfile>('/organization'), []);
  const [draft, setDraft] = useState<OrgProfile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (org.data) setDraft(org.data); }, [org.data]);
  if (org.loading && !draft) return <LoadingBlock />;
  if (org.error || !draft) return <ErrorState message={org.error ?? 'Sem dados'} onRetry={org.reload} />;
  const s = draft.settings;
  const setS = (patch: Partial<OrgProfile['settings']>) => setDraft({ ...draft, settings: { ...s, ...patch } });
  const toggleList = (key: 'requireVehicleFor' | 'requireWorkOrderFor', type: string, on: boolean) =>
    setS({ [key]: on ? [...new Set([...s[key], type])] : s[key].filter((t) => t !== type) } as Partial<OrgProfile['settings']>);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.patch<OrgProfile>('/organization', {
        name: draft.name, legalName: draft.legalName || undefined, document: draft.document || undefined, email: draft.email || undefined, phone: draft.phone || undefined,
        settings: { ...s, annualDepreciationPercent: s.annualDepreciationPercent === null || (s.annualDepreciationPercent as unknown) === '' ? null : Number(s.annualDepreciationPercent) },
      });
      org.setData(saved);
      toast.success('Configurações salvas');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader title="Configurações da empresa" description="Dados cadastrais e regras de negócio aplicadas pelo servidor em todas as filiais."
        actions={<Button variant="primary" icon={Save} loading={busy} onClick={save}>Salvar</Button>} />
      {draft.plan && (
        <Card title={`Plano ${draft.plan.name}`} actions={<Status kind="subscription" value={draft.plan.status} />}>
          <div className="stack">
            <KeyValue items={[
              { label: 'Veículos', value: `${draft.usage.vehicles} de ${draft.plan.maxVehicles ?? 'ilimitado'}` },
              { label: 'Filiais', value: `${draft.usage.branches} de ${draft.plan.maxBranches ?? 'ilimitado'}` },
              { label: 'Usuários', value: `${draft.usage.users} de ${draft.plan.maxUsers ?? 'ilimitado'}` },
              { label: 'Avaliação até', value: date(draft.plan.trialEndsAt), hidden: !draft.plan.trialEndsAt },
            ]} />
            <div className="row" style={{ gap: 6 }}>{draft.enabledModules.map((m) => <Badge key={m} tone="brand">{MODULE_LABEL[m]}</Badge>)}</div>
          </div>
        </Card>
      )}
      <Card title="Dados da empresa">
        <FormGrid>
          <Field label="Nome fantasia" required className="span-6"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Razão social" className="span-6"><Input value={draft.legalName ?? ''} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} /></Field>
          <Field label="CNPJ" className="span-4"><Input value={draft.document ?? ''} onChange={(e) => setDraft({ ...draft, document: e.target.value })} /></Field>
          <Field label="E-mail" className="span-4"><Input type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
          <Field label="Telefone" className="span-4"><Input value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
        </FormGrid>
      </Card>
      <div className="grid-2">
        <Card title="Locação">
          <div className="stack">
            <Field label="Horas de preparo entre locações" hint="Tempo bloqueado na agenda após cada devolução (limpeza, vistoria).">
              <Input type="number" min={0} max={72} value={s.turnaroundHours} onChange={(e) => setS({ turnaroundHours: Number(e.target.value) })} />
            </Field>
            <Field label="Validade de pedido do site (horas)" hint="Pedido de reserva sem confirmação expira depois disso.">
              <Input type="number" min={1} max={720} value={s.requestExpiryHours} onChange={(e) => setS({ requestExpiryHours: Number(e.target.value) })} />
            </Field>
            <Switch label="Impedir locação com CNH vencida" description="Retirada é recusada pelo servidor se a CNH do motorista estiver vencida." checked={s.blockExpiredCnh} onChange={(e) => setS({ blockExpiredCnh: e.target.checked })} />
          </div>
        </Card>
        <Card title="Financeiro">
          <div className="stack">
            <div className="grid-2">
              <Field label="Multa por atraso (%)"><Input type="number" step="0.1" min={0} max={20} value={s.lateFeePercent} onChange={(e) => setS({ lateFeePercent: Number(e.target.value) })} /></Field>
              <Field label="Juros ao mês (%)"><Input type="number" step="0.1" min={0} max={10} value={s.monthlyInterestPercent} onChange={(e) => setS({ monthlyInterestPercent: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Depreciação anual da frota (%)" hint="Usada na rentabilidade. Vazio = sem política definida (o indicador avisa).">
              <Input type="number" step="0.1" min={0} max={100} value={s.annualDepreciationPercent ?? ''} onChange={(e) => setS({ annualDepreciationPercent: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
          </div>
        </Card>
        <Card title="Estoque" subtitle="Vínculos obrigatórios por tipo de saída.">
          <div className="stack-sm">
            {OUT_TYPES.map((t) => (
              <div key={t} className="row-between">
                <span className="small">{MOVEMENT_TYPE_LABEL[t]}</span>
                <span className="row">
                  <Checkbox label="Placa" checked={s.requireVehicleFor.includes(t)} onChange={(e) => toggleList('requireVehicleFor', t, e.target.checked)} />
                  <Checkbox label="OS" checked={s.requireWorkOrderFor.includes(t)} onChange={(e) => toggleList('requireWorkOrderFor', t, e.target.checked)} />
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Alertas e notificações">
          <div className="stack">
            <Field label="Antecedência dos alertas de vencimento (dias)" hint="CNH, licenciamento, IPVA, seguro e documentos.">
              <Input type="number" min={1} max={180} value={s.documentAlertDays} onChange={(e) => setS({ documentAlertDays: Number(e.target.value) })} />
            </Field>
            <Switch label="Enviar por e-mail" description="Requer SMTP configurado pela Norty." checked={s.notificationChannels.email} onChange={(e) => setS({ notificationChannels: { ...s.notificationChannels, email: e.target.checked } })} />
            <Switch label="Enviar para webhooks" description="Endpoints cadastrados em Integrações." checked={s.notificationChannels.webhook} onChange={(e) => setS({ notificationChannels: { ...s.notificationChannels, webhook: e.target.checked } })} />
            <Alert tone="neutral">WhatsApp depende de integração autorizada (WhatsApp Business) e fica pendente até a configuração das credenciais.</Alert>
          </div>
        </Card>
      </div>
    </Page>
  );
}
