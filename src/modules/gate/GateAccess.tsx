import { DoorOpen } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { AccessLogTable } from '../../components/AccessLogTable';
import { PageHeader } from '../../components/ui';

export function GateAccess() {
  const { condominium, dataVersion } = useAuthenticated();
  return (
    <>
      <PageHeader
        icon={<DoorOpen size={22} />}
        title="Controle de acesso"
        subtitle="Histórico completo de entradas e saídas do condomínio"
      />
      <AccessLogTable condominiumId={condominium.id} dataVersion={dataVersion} />
    </>
  );
}
