import { useMemo, useState } from 'react';
import { Car, HardHat, Phone, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { residents, residentsOfUnit, staffOfUnit, unitLabel, units } from '../../services/directory';
import { vehiclesOfUnit } from '../../services/vehicles';
import { activeAuthorizations } from '../../services/visitors';
import type { Unit } from '../../data/types';
import {
  Avatar, Badge, Button, Card, DataTable, Drawer, EmptyState, PageHeader, SearchInput,
  type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';

export function GateResidents() {
  const { condominium, dataVersion } = useAuthenticated();
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Unit | null>(null);

  const allUnits = useMemo(() => units(condominium.id), [condominium.id, dataVersion]);
  const allResidents = useMemo(() => residents(condominium.id), [condominium.id, dataVersion]);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (q.length < 1) return allUnits.slice(0, 60);
    const matchingUnitIds = new Set(
      allResidents.filter((r) => r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.document.includes(q)).map((r) => r.unitId),
    );
    return allUnits
      .filter((u) => u.label.includes(q) || `${u.block}-${u.label}`.toLowerCase().includes(q)
        || u.ownerName.toLowerCase().includes(q) || matchingUnitIds.has(u.id)
        || u.parkingSpots.some((s) => s.toLowerCase().includes(q)))
      .slice(0, 80);
  }, [allUnits, allResidents, term]);

  const columns: Column<Unit>[] = [
    { key: 'unit', header: 'Unidade', render: (u) => <CellStack title={`Torre ${u.block} · Apto ${u.label}`} meta={`${u.bedrooms} dorm · ${u.area} m²`} /> },
    { key: 'owner', header: 'Responsável', render: (u) => u.ownerName },
    { key: 'residents', header: 'Moradores', hideOnMobile: true, render: (u) => residentsOfUnit(u.id).length },
    { key: 'spots', header: 'Vagas', hideOnMobile: true, render: (u) => <span className="nx-mono nx-text-sm">{u.parkingSpots.join(', ')}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (u) => <Badge tone={u.status === 'vaga' ? 'neutral' : 'success'} size="sm">{u.status}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<Users size={22} />}
        title="Moradores e unidades"
        subtitle="Consulta rápida para atendimento na portaria"
      />

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} size="lg" placeholder="Buscar por unidade, nome, telefone ou vaga..." autoFocus />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(u) => u.id}
          onRowClick={setSelected}
          empty={<EmptyState icon={<Users size={24} />} title="Nenhuma unidade encontrada" description="Busque por número da unidade, nome do morador ou vaga." />}
          mobileCard={(u) => (
            <div className="nx-row nx-gap-3">
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">Torre {u.block} · Apto {u.label}</span>
                <span className="nx-text-xs nx-text-subtle">{u.ownerName} · {residentsOfUnit(u.id).length} moradores</span>
              </div>
              <Badge tone={u.status === 'vaga' ? 'neutral' : 'success'} size="sm">{u.status}</Badge>
            </div>
          )}
        />
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? unitLabel(selected.id) : undefined}
        subtitle={selected ? `${selected.bedrooms} dormitórios · ${selected.area} m² · vagas ${selected.parkingSpots.join(', ')}` : undefined}
        width={480}
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Moradores</p>
              <ul className="nx-list">
                {residentsOfUnit(selected.id).map((r) => (
                  <li key={r.id} className="nx-list__item">
                    <Avatar name={r.name} size="md" />
                    <div className="nx-stack nx-grow">
                      <span className="nx-medium">{r.name}</span>
                      <span className="nx-text-xs nx-text-subtle">{r.type} · {r.phone}</span>
                    </div>
                    <Button variant="ghost" size="sm" icon={<Phone size={15} />} aria-label="Ligar" />
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Veículos</p>
              {vehiclesOfUnit(selected.id).length === 0 ? (
                <p className="nx-text-sm nx-text-subtle">Nenhum veículo cadastrado.</p>
              ) : (
                <ul className="nx-list">
                  {vehiclesOfUnit(selected.id).map((v) => (
                    <li key={v.id} className="nx-list__item">
                      <span className="nx-list__icon"><Car size={16} /></span>
                      <div className="nx-stack nx-grow">
                        <span className="nx-medium nx-mono">{v.plate}</span>
                        <span className="nx-text-xs nx-text-subtle">{v.brand} {v.model} · {v.color}</span>
                      </div>
                      <Badge tone={v.authorized ? 'success' : 'danger'} size="sm">{v.authorized ? 'OK' : 'Suspenso'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Funcionários autorizados</p>
              {staffOfUnit(selected.id).length === 0 ? (
                <p className="nx-text-sm nx-text-subtle">Nenhum funcionário cadastrado.</p>
              ) : (
                <ul className="nx-list">
                  {staffOfUnit(selected.id).map((s) => (
                    <li key={s.id} className="nx-list__item">
                      <span className="nx-list__icon"><HardHat size={16} /></span>
                      <div className="nx-stack nx-grow">
                        <span className="nx-medium">{s.name}</span>
                        <span className="nx-text-xs nx-text-subtle">{s.role} · {s.shiftStart}–{s.shiftEnd}</span>
                      </div>
                      <Badge tone={s.active ? 'success' : 'neutral'} size="sm">{s.active ? 'Ativo' : 'Inativo'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Autorizações ativas</p>
              {activeAuthorizations(selected.id).length === 0 ? (
                <p className="nx-text-sm nx-text-subtle">Nenhuma autorização ativa.</p>
              ) : (
                <ul className="nx-list">
                  {activeAuthorizations(selected.id).map((v) => (
                    <li key={v.id} className="nx-list__item">
                      <Avatar name={v.name} size="sm" />
                      <div className="nx-stack nx-grow">
                        <span className="nx-medium">{v.name}</span>
                        <span className="nx-text-xs nx-text-subtle">{v.expectedTime} · código {v.code}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}
