import { useMemo, useState } from 'react';
import {
  AlertTriangle, Car, CheckCircle2, PhoneCall, RefreshCw, ScanLine, ShieldQuestion, XCircle,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { confirmPlateEntry, gates, readPlate, type PlateReadResult } from '../../services/access';
import { vehicles } from '../../services/vehicles';
import { unitLabel } from '../../services/directory';
import {
  Badge, Button, Card, CardHeader, DetailList, Input, PageHeader, Select, useToast,
} from '../../components/ui';
import { plateMask } from '../../lib/format';
import './gate.css';

export function PlateScanner() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();

  const [plate, setPlate] = useState('');
  const [gateId, setGateId] = useState('gate-garagem');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<PlateReadResult | null>(null);
  const [released, setReleased] = useState(false);

  const gateList = useMemo(() => gates(condominium.id), [condominium.id, dataVersion]);
  const samples = useMemo(() => vehicles(condominium.id).slice(0, 4), [condominium.id, dataVersion]);

  const scan = (value?: string) => {
    const target = plateMask(value ?? plate);
    if (target.length < 7) { toast.error('Placa inválida', 'Informe os 7 caracteres da placa.'); return; }
    setPlate(target);
    setScanning(true);
    setResult(null);
    setReleased(false);
    window.setTimeout(() => {
      setResult(readPlate(condominium.id, target));
      setScanning(false);
    }, 1400);
  };

  const release = () => {
    if (!result) return;
    confirmPlateEntry(condominium.id, result, gateId, user.name);
    setReleased(true);
    toast.success('Acesso liberado', `${result.plate} · entrada registrada pelo ${gateList.find((g) => g.id === gateId)?.name}.`);
  };

  return (
    <>
      <PageHeader
        icon={<ScanLine size={22} />}
        title="Leitura de placa"
        subtitle="Reconhecimento automático de veículos na entrada da garagem"
        actions={<Badge tone="warning">Integração LPR real prevista para a Fase 4</Badge>}
      />

      <div className="nx-plate-stage">
        <div className="nx-stack nx-gap-4">
          <div className="nx-camera-frame">
            <div className="nx-camera-frame__noise" />
            <span className="nx-camera-frame__label"><Car size={13} /> CAM 06 · GARAGEM — ENTRADA</span>
            <span className="nx-camera-frame__rec"><i /> REC</span>
            {scanning && <div className="nx-camera-frame__scan" />}
            {(scanning || result) && (
              <div className={`nx-camera-frame__plate ${result && !result.authorized ? 'is-denied' : ''}`}>
                <strong>{scanning ? 'LENDO...' : result?.plate}</strong>
              </div>
            )}
            {!scanning && !result && (
              <div className="nx-camera-frame__plate" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                <strong style={{ fontSize: 'var(--text-lg)', letterSpacing: '0.06em' }}>AGUARDANDO VEÍCULO</strong>
              </div>
            )}
          </div>

          <Card padding="md">
            <div className="nx-row nx-gap-3 nx-wrap">
              <Input
                className="nx-grow"
                label="Placa detectada"
                value={plate}
                onChange={(e) => setPlate(plateMask(e.target.value))}
                placeholder="ABC1D23"
                inputSize="lg"
              />
              <Select
                label="Portão"
                options={gateList.map((g) => ({ value: g.id, label: g.name }))}
                value={gateId}
                onChange={(e) => setGateId(e.target.value)}
                selectSize="lg"
              />
              <div style={{ alignSelf: 'flex-end' }}>
                <Button variant="primary" size="lg" loading={scanning} icon={<ScanLine size={18} />} onClick={() => scan()}>
                  Consultar
                </Button>
              </div>
            </div>

            <div className="nx-row nx-gap-2 nx-wrap" style={{ marginTop: 'var(--space-4)' }}>
              <span className="nx-text-xs nx-text-subtle">Simular leitura:</span>
              {samples.map((v) => (
                <button key={v.id} className="nx-plate-sample" onClick={() => scan(v.plate)}>{v.plate}</button>
              ))}
              <button className="nx-plate-sample is-unknown" onClick={() => scan('ABC9X88')}>ABC9X88 (não cadastrada)</button>
            </div>
          </Card>
        </div>

        <div className="nx-stack nx-gap-4">
          {!result && !scanning && (
            <Card padding="lg">
              <div className="nx-stack nx-center nx-gap-3" style={{ textAlign: 'center', padding: 'var(--space-5) 0' }}>
                <span className="nx-list__icon" style={{ width: 56, height: 56 }}><ShieldQuestion size={26} /></span>
                <p className="nx-semibold">Nenhuma leitura em andamento</p>
                <p className="nx-text-sm nx-text-muted">
                  Digite a placa ou selecione um exemplo para simular a chegada de um veículo.
                </p>
              </div>
            </Card>
          )}

          {scanning && (
            <Card padding="lg">
              <div className="nx-stack nx-center nx-gap-3" style={{ textAlign: 'center', padding: 'var(--space-5) 0' }}>
                <RefreshCw size={28} className="nx-spinner" />
                <p className="nx-semibold">Consultando cadastro...</p>
                <p className="nx-text-sm nx-text-muted">Comparando a placa com a base de veículos do condomínio.</p>
              </div>
            </Card>
          )}

          {result && (
            <>
              <div className={`nx-plate-result ${result.authorized ? 'is-authorized' : 'is-denied'}`}>
                <div className="nx-row nx-gap-3">
                  {result.authorized ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
                  <div className="nx-grow">
                    <p className="nx-semibold" style={{ fontSize: 'var(--text-lg)' }}>
                      {result.authorized ? 'Veículo autorizado' : 'Veículo não autorizado'}
                    </p>
                    <p className="nx-text-sm">{result.reason}</p>
                  </div>
                </div>
              </div>

              <Card padding="md">
                <CardHeader title="Dados da consulta" compact />
                <DetailList
                  columns={2}
                  items={[
                    { label: 'Placa', value: <span className="nx-mono">{result.plate}</span> },
                    { label: 'Veículo', value: result.vehicle ? `${result.vehicle.brand} ${result.vehicle.model}` : 'Não identificado' },
                    { label: 'Cor', value: result.vehicle?.color ?? '—' },
                    { label: 'Proprietário', value: result.vehicle?.ownerName ?? '—' },
                    { label: 'Unidade', value: result.vehicle?.unitId ? unitLabel(result.vehicle.unitId) : '—' },
                    { label: 'Vaga', value: result.vehicle?.parkingSpot ?? '—' },
                  ]}
                />
              </Card>

              {result.authorized ? (
                <Button variant="success" size="xl" block icon={<CheckCircle2 size={20} />} disabled={released} onClick={release}>
                  {released ? 'Acesso liberado' : 'Liberar acesso'}
                </Button>
              ) : (
                <div className="nx-stack nx-gap-2">
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    icon={<AlertTriangle size={18} />}
                    onClick={() => toast.info('Autorização solicitada', 'O morador da unidade foi notificado para autorizar o veículo.')}
                  >
                    Solicitar autorização ao morador
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    block
                    icon={<PhoneCall size={18} />}
                    onClick={() => toast.info('Portaria acionada', 'A guarita principal foi chamada para atendimento presencial.')}
                  >
                    Chamar portaria
                  </Button>
                  <Button variant="ghost" block onClick={() => { setResult(null); setPlate(''); }}>Nova leitura</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
