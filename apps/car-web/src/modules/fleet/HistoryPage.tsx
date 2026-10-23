/* Histórico por placa: a linha do tempo completa, inclusive de veículos vendidos ou excluídos. */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { History, Search } from 'lucide-react';
import { isValidPlate, normalizePlate, type VehicleDetail } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Plate } from '../../components/ui';
import { Status } from '../../components/status';
import { api } from '../../lib/api';
import { useApi, useQueryState } from '../../lib/hooks';
import { km } from '../../lib/format';
import { TimelineTab } from './VehicleDetailPage';

export function HistoryPage() {
  const [plate, setPlate] = useQueryState('placa');
  const [input, setInput] = useState(plate);
  const valid = isValidPlate(plate);
  const v = useApi(() => api.get<VehicleDetail>(`/vehicles/by-plate/${normalizePlate(plate)}`), [plate], valid);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setPlate(normalizePlate(input));
  };
  return (
    <Page>
      <PageHeader title="Histórico por placa" description="Cadastro, situação, contratos, motoristas, vistorias, manutenções, peças, multas, sinistros, despesas e venda — numa linha do tempo só." />
      <Card>
        <form className="row" onSubmit={submit}>
          <input className="nc-input mono" style={{ maxWidth: 220, textTransform: 'uppercase' }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="ABC1D23" aria-label="Placa" maxLength={8} />
          <Button type="submit" variant="primary" icon={Search} disabled={!isValidPlate(input)}>Consultar</Button>
          {input && !isValidPlate(input) && <span className="small text-danger">Placa inválida.</span>}
        </form>
      </Card>
      {!valid ? <Card><EmptyState icon={History} title="Informe uma placa" description="A consulta inclui veículos vendidos e excluídos do cadastro." /></Card>
        : v.loading && !v.data ? <LoadingBlock />
        : v.error ? <ErrorState message={v.error} onRetry={v.reload} />
        : v.data && (
          <>
            <Card title={<span className="row"><Plate value={v.data.plate} /> {v.data.model.make.name} {v.data.model.name}</span>}
              actions={<Link className="nc-btn nc-btn--secondary nc-btn--sm" to={`/frota/veiculos/${v.data.id}`}>Abrir ficha</Link>}>
              <div className="stack">
                {v.data.deletedAt && <Alert tone="neutral">Veículo excluído do cadastro. Histórico preservado.</Alert>}
                <KeyValue items={[
                  { label: 'Código interno', value: v.data.internalCode },
                  { label: 'Ano', value: `${v.data.yearManufacture}/${v.data.yearModel}` },
                  { label: 'Cor', value: v.data.color },
                  { label: 'Filial', value: v.data.branch.name },
                  { label: 'Quilometragem', value: km(v.data.odometerKm) },
                  { label: 'Comercial', value: <Status kind="commercial" value={v.data.commercialStatus} /> },
                  { label: 'Operacional', value: <Status kind="operational" value={v.data.operationalStatus} /> },
                  { label: 'Contrato em aberto', value: v.data.openContract ? <Badge tone="brand">{v.data.openContract.number}</Badge> : 'Nenhum' },
                ]} />
              </div>
            </Card>
            <TimelineTab vehicleId={v.data.id} />
          </>
        )}
    </Page>
  );
}
