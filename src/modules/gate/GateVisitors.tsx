import { useMemo, useState } from 'react';
import { BellRing, CheckCircle2, LogOut, QrCode, ScanLine, UserCheck, XCircle } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  AUTHORIZATION_LABEL, VISITOR_STATUS_LABEL, checkIn, checkOut, denyVisitor, findByCode,
  requestAuthorization, statusTone, visitorsOfCondominium,
} from '../../services/visitors';
import { unitLabel, units } from '../../services/directory';
import type { Visitor } from '../../data/types';
import {
  Avatar, Badge, Button, Card, DataTable, EmptyState, Input, Modal, PageHeader, SearchInput,
  Select, StatCard, Tabs, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDate, formatTime, isoDate } from '../../lib/date';
import './gate.css';

export function GateVisitors() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const today = isoDate(new Date());

  const [tab, setTab] = useState('esperados');
  const [term, setTerm] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState<Visitor | null | 'not-found'>(null);
  const [scanning, setScanning] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestUnitQuery, setRequestUnitQuery] = useState('');
  const [requestUnitId, setRequestUnitId] = useState('');

  const all = useMemo(() => visitorsOfCondominium(condominium.id), [condominium.id, dataVersion]);

  const unitOptions = useMemo(() => {
    const list = units(condominium.id);
    const q = requestUnitQuery.trim().toLowerCase();
    return (q ? list.filter((u) => `${u.block}${u.label}`.toLowerCase().includes(q) || u.label.includes(q)) : list)
      .slice(0, 40)
      .map((u) => ({ value: u.id, label: `Torre ${u.block} · Apto ${u.label} — ${u.ownerName}` }));
  }, [condominium.id, requestUnitQuery, dataVersion]);

  const expected = all.filter((v) => v.expectedDate === today && (v.status === 'aguardando' || v.status === 'liberado'));
  const inside = all.filter((v) => v.status === 'no_local');
  const finished = all.filter((v) => v.status === 'finalizado' && v.checkOutAt?.slice(0, 10) === today);

  const rows = useMemo(() => {
    const base = tab === 'esperados' ? expected : tab === 'no_local' ? inside : finished;
    const q = term.trim().toLowerCase();
    if (!q) return base;
    return base.filter((v) => [v.name, v.document, v.code, v.vehiclePlate ?? ''].some((f) => f.toLowerCase().includes(q)));
  }, [tab, expected, inside, finished, term]);

  const release = (v: Visitor) => {
    checkIn(v.id, 'gate-principal', user.name, 'manual');
    toast.success('Entrada registrada', `${v.name} · ${unitLabel(v.unitId)}`);
  };

  const exit = (v: Visitor) => {
    checkOut(v.id, 'gate-principal', user.name);
    toast.info('Saída registrada', `${v.name} deixou o condomínio.`);
  };

  const validateCode = () => {
    setScanning(true);
    window.setTimeout(() => {
      const found = findByCode(condominium.id, code);
      setScanned(found ?? 'not-found');
      setScanning(false);
    }, 900);
  };

  const columns: Column<Visitor>[] = [
    {
      key: 'name',
      header: 'Visitante',
      render: (v) => (
        <span className="nx-row nx-gap-3">
          <Avatar name={v.name} size="sm" />
          <CellStack title={v.name} meta={v.companyName ?? v.document} />
        </span>
      ),
    },
    { key: 'unit', header: 'Unidade', render: (v) => unitLabel(v.unitId) },
    { key: 'time', header: 'Previsto', hideOnMobile: true, render: (v) => <CellStack title={v.expectedTime} meta={v.expectedDate === today ? 'Hoje' : formatDate(v.expectedDate)} /> },
    { key: 'kind', header: 'Autorização', hideOnMobile: true, render: (v) => <Badge tone="brand" size="sm">{AUTHORIZATION_LABEL[v.kind]}</Badge> },
    { key: 'code', header: 'Código', hideOnMobile: true, render: (v) => <span className="nx-mono nx-text-sm">{v.code}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '230px',
      render: (v) => (
        <span className="nx-row nx-gap-2 nx-end">
          {(v.status === 'aguardando' || v.status === 'liberado') && (
            <>
              <Button variant="ghost" size="sm" icon={<XCircle size={15} />} onClick={() => { denyVisitor(v.id, user.name); toast.warning('Entrada recusada', v.name); }}>Recusar</Button>
              <Button variant="success" size="sm" icon={<CheckCircle2 size={15} />} onClick={() => release(v)}>
                {v.status === 'liberado' ? 'Registrar entrada' : 'Liberar'}
              </Button>
            </>
          )}
          {v.status === 'no_local' && (
            <Button variant="secondary" size="sm" icon={<LogOut size={15} />} onClick={() => exit(v)}>Registrar saída</Button>
          )}
          {v.status === 'finalizado' && v.checkOutAt && (
            <span className="nx-text-sm nx-text-subtle">Saída às {formatTime(v.checkOutAt)}</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<UserCheck size={22} />}
        title="Visitantes"
        subtitle="Lista de chegadas do dia e validação de convites"
        actions={
          <>
            <Button variant="secondary" icon={<BellRing size={17} />} onClick={() => setRequestOpen(true)}>
              Solicitar autorização
            </Button>
            <Button variant="primary" icon={<ScanLine size={17} />} onClick={() => { setScanOpen(true); setScanned(null); setCode(''); }}>
              Validar QR Code
            </Button>
          </>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'esperados', label: 'Esperados hoje', count: expected.length },
              { id: 'no_local', label: 'No condomínio', count: inside.length },
              { id: 'finalizados', label: 'Saídas de hoje', count: finished.length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Esperados hoje" value={expected.length} icon={<UserCheck size={17} />} tone="gold" />
        <StatCard label="No condomínio" value={inside.length} icon={<CheckCircle2 size={17} />} tone="success" />
        <StatCard label="Saídas registradas" value={finished.length} icon={<LogOut size={17} />} tone="neutral" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por nome, documento, código ou placa..." size="lg" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(v) => v.id}
          empty={<EmptyState icon={<UserCheck size={24} />} title="Nenhum visitante nesta lista" description="As autorizações criadas pelos moradores aparecem automaticamente aqui." />}
          mobileCard={(v) => (
            <div className="nx-stack nx-gap-3">
              <div className="nx-row nx-gap-3">
                <Avatar name={v.name} size="md" />
                <div className="nx-stack nx-grow">
                  <span className="nx-medium">{v.name}</span>
                  <span className="nx-text-xs nx-text-subtle">{unitLabel(v.unitId)} · {v.expectedTime}</span>
                </div>
                <Badge tone={statusTone(v.status)} size="sm">{VISITOR_STATUS_LABEL[v.status]}</Badge>
              </div>
              {(v.status === 'aguardando' || v.status === 'liberado') && (
                <div className="nx-row nx-gap-2">
                  <Button variant="secondary" size="sm" block onClick={() => denyVisitor(v.id, user.name)}>Recusar</Button>
                  <Button variant="success" size="sm" block onClick={() => release(v)}>
                    {v.status === 'liberado' ? 'Registrar entrada' : 'Liberar'}
                  </Button>
                </div>
              )}
              {v.status === 'no_local' && <Button variant="secondary" size="sm" block onClick={() => exit(v)}>Registrar saída</Button>}
            </div>
          )}
        />
      </Card>

      {/* ---------- Visitante não anunciado: pede autorização ao morador ---------- */}
      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Solicitar autorização"
        subtitle="O morador recebe a notificação e decide pelo aplicativo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              icon={<BellRing size={16} />}
              disabled={requestName.trim().length < 3 || !requestUnitId}
              onClick={() => {
                requestAuthorization({
                  condominiumId: condominium.id,
                  unitId: requestUnitId,
                  name: requestName.trim(),
                  gateName: 'Portaria Principal',
                  requestedBy: user.name,
                });
                setRequestOpen(false);
                setRequestName(''); setRequestUnitId(''); setRequestUnitQuery('');
                toast.success('Autorização solicitada', 'O morador foi notificado e pode liberar ou recusar a entrada.');
              }}
            >
              Enviar solicitação
            </Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input label="Nome do visitante" value={requestName} onChange={(e) => setRequestName(e.target.value)} placeholder="Nome informado na portaria" autoFocus />
          <Input label="Buscar unidade" value={requestUnitQuery} onChange={(e) => setRequestUnitQuery(e.target.value)} placeholder="Ex.: 1204 ou A1204" />
          <Select label="Unidade" options={unitOptions} placeholder="Selecione a unidade" value={requestUnitId} onChange={(e) => setRequestUnitId(e.target.value)} required />
          <div className="nx-callout">
            <p className="nx-medium">Como funciona</p>
            <p className="nx-text-sm nx-text-muted">
              O morador recebe a notificação “Visitante chegou” com os botões Liberar e Recusar.
              A decisão volta para a portaria e a entrada só é registrada após a liberação.
            </p>
          </div>
        </div>
      </Modal>

      {/* ---------- Validação de QR / código ---------- */}
      <Modal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Validar convite"
        subtitle="Leitura de QR Code ou digitação do código"
        footer={
          scanned && scanned !== 'not-found' && scanned.status === 'aguardando' ? (
            <>
              <Button variant="ghost" onClick={() => setScanOpen(false)}>Fechar</Button>
              <Button
                variant="success"
                icon={<CheckCircle2 size={16} />}
                onClick={() => {
                  checkIn(scanned.id, 'gate-principal', user.name, 'qrcode');
                  setScanOpen(false);
                  toast.success('Convidado autorizado', `${scanned.name} · ${unitLabel(scanned.unitId)}`);
                }}
              >
                Liberar entrada
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setScanOpen(false)}>Fechar</Button>
          )
        }
      >
        <div className="nx-stack nx-gap-4">
          <div className="nx-scan-box">
            <QrCode size={54} />
            <p className="nx-text-sm">Aponte a câmera para o QR Code do convite</p>
            <span className="nx-text-xs nx-text-subtle">Leitura óptica prevista para a Fase 4 · digite o código abaixo</span>
          </div>

          <div className="nx-row nx-gap-2">
            <Input
              className="nx-grow"
              placeholder="NX-XXXXXX"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setScanned(null); }}
              inputSize="lg"
              autoFocus
            />
            <Button variant="primary" size="lg" loading={scanning} onClick={validateCode} disabled={code.length < 4}>Validar</Button>
          </div>

          {scanned === 'not-found' && (
            <div className="nx-plate-result is-denied">
              <div className="nx-row nx-gap-3">
                <XCircle size={22} />
                <div>
                  <p className="nx-semibold">Convite não encontrado</p>
                  <p className="nx-text-sm">Nenhuma autorização ativa corresponde ao código informado.</p>
                </div>
              </div>
            </div>
          )}

          {scanned && scanned !== 'not-found' && (
            <div className={`nx-plate-result ${scanned.status === 'aguardando' ? 'is-authorized' : ''}`}>
              <div className="nx-row nx-gap-3">
                <Avatar name={scanned.name} size="lg" />
                <div className="nx-grow">
                  <p className="nx-semibold" style={{ fontSize: 'var(--text-lg)' }}>{scanned.name}</p>
                  <p className="nx-text-sm">{unitLabel(scanned.unitId)}</p>
                  <p className="nx-text-xs nx-text-muted">
                    {AUTHORIZATION_LABEL[scanned.kind]} · previsto para {formatDate(scanned.expectedDate)} às {scanned.expectedTime}
                  </p>
                </div>
                <Badge tone={statusTone(scanned.status)}>{VISITOR_STATUS_LABEL[scanned.status]}</Badge>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
