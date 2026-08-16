import { useMemo, useState } from 'react';
import { Barcode, Copy, Download, QrCode, Receipt, Wallet } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { INVOICE_STATUS_LABEL, invoiceTone, invoicesOfUnit, nextInvoice, payInvoice } from '../../services/finance';
import { unitLabel } from '../../services/directory';
import type { Invoice } from '../../data/types';
import {
  Badge, Button, Card, CardHeader, DataTable, DetailList, EmptyState, Modal, PageHeader,
  QRCode, StatCard, useToast, type Column,
} from '../../components/ui';
import { CellStack } from '../../components/PageBits';
import { currency } from '../../lib/format';
import { daysUntil, formatDate } from '../../lib/date';

export function ResidentFinance() {
  const { user, dataVersion } = useAuthenticated();
  const toast = useToast();
  const unitId = user.unitId!;

  const [paying, setPaying] = useState<Invoice | null>(null);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [processing, setProcessing] = useState(false);

  const invoices = useMemo(() => invoicesOfUnit(unitId), [unitId, dataVersion]);
  const next = useMemo(() => nextInvoice(unitId), [unitId, dataVersion]);
  const paid = invoices.filter((i) => i.status === 'pago');
  const overdue = invoices.filter((i) => i.status === 'vencido');
  const dueIn = next ? daysUntil(next.dueDate) : null;

  const confirmPayment = () => {
    if (!paying) return;
    setProcessing(true);
    window.setTimeout(() => {
      payInvoice(paying.id, user.name);
      setProcessing(false);
      setPaying(null);
      toast.success('Pagamento confirmado', 'A baixa foi registrada e o comprovante está disponível.');
    }, 1100);
  };

  const columns: Column<Invoice>[] = [
    { key: 'reference', header: 'Competência', render: (i) => <CellStack title={i.reference} meta={`Vence em ${formatDate(i.dueDate)}`} /> },
    { key: 'amount', header: 'Valor', render: (i) => <strong className="nx-nums">{currency(i.amount)}</strong> },
    { key: 'paid', header: 'Pagamento', hideOnMobile: true, render: (i) => (i.paidAt ? formatDate(i.paidAt) : '—') },
    { key: 'status', header: 'Status', render: (i) => <Badge tone={invoiceTone(i.status)} size="sm">{INVOICE_STATUS_LABEL[i.status]}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '190px',
      render: (i) => (
        <span className="nx-row nx-gap-2 nx-end">
          <Button variant="ghost" size="sm" onClick={() => setDetail(i)}>Detalhes</Button>
          {i.status !== 'pago' && <Button variant="primary" size="sm" onClick={() => setPaying(i)}>Pagar</Button>}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Wallet size={22} />}
        title="Meu financeiro"
        subtitle={`Boletos e histórico de pagamentos de ${unitLabel(unitId)}`}
      />

      <div className="nx-finance-hero">
        <Card padding="lg" className="nx-finance-hero__main">
          <p className="nx-uppercase nx-text-subtle">Próximo vencimento</p>
          {next ? (
            <>
              <p className="nx-finance-amount" style={{ marginTop: 'var(--space-2)' }}>{currency(next.amount)}</p>
              <p className="nx-text-muted">
                Referência {next.reference} · vencimento em {formatDate(next.dueDate)}
                {dueIn !== null && (dueIn < 0 ? ' (em atraso)' : dueIn === 0 ? ' (hoje)' : ` (em ${dueIn} dias)`)}
              </p>
              <div className="nx-row nx-gap-2 nx-wrap" style={{ marginTop: 'var(--space-5)' }}>
                <Button variant="brand" size="lg" icon={<Wallet size={18} />} onClick={() => setPaying(next)}>Pagar agora</Button>
                <Button variant="secondary" size="lg" icon={<Barcode size={18} />} onClick={() => setDetail(next)}>Ver boleto</Button>
              </div>
            </>
          ) : (
            <EmptyState compact icon={<Receipt size={20} />} title="Nenhum boleto em aberto" description="Todos os pagamentos da unidade estão em dia." />
          )}
        </Card>

        <div className="nx-stack nx-gap-4">
          <StatCard label="Boletos pagos" value={paid.length} icon={<Receipt size={17} />} tone="success" hint="Histórico completo" />
          <StatCard label="Em atraso" value={overdue.length} icon={<Barcode size={17} />} tone={overdue.length ? 'danger' : 'neutral'} />
          <StatCard
            label="Total pago no período"
            value={currency(paid.slice(0, 6).reduce((s, i) => s + i.amount, 0))}
            icon={<Wallet size={17} />}
            tone="brand"
            hint="Últimos 6 boletos"
          />
        </div>
      </div>

      <Card padding="none" style={{ marginTop: 'var(--space-5)' }}>
        <CardHeader title="Histórico de boletos" subtitle={`${invoices.length} lançamentos`} compact />
        <DataTable
          columns={columns}
          rows={invoices}
          keyOf={(i) => i.id}
          empty={<EmptyState icon={<Receipt size={24} />} title="Nenhum boleto encontrado" />}
          mobileCard={(i) => (
            <div className="nx-row nx-gap-3">
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{i.reference}</span>
                <span className="nx-text-xs nx-text-subtle">Vence em {formatDate(i.dueDate)}</span>
                <Badge tone={invoiceTone(i.status)} size="sm">{INVOICE_STATUS_LABEL[i.status]}</Badge>
              </div>
              <div className="nx-stack nx-gap-2" style={{ alignItems: 'flex-end' }}>
                <strong className="nx-nums">{currency(i.amount)}</strong>
                {i.status !== 'pago' && <Button variant="primary" size="sm" onClick={() => setPaying(i)}>Pagar</Button>}
              </div>
            </div>
          )}
        />
      </Card>

      {/* ---------- Detalhe do boleto ---------- */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={`Boleto ${detail?.reference ?? ''}`}
        subtitle={unitLabel(unitId)}
        footer={
          <>
            <Button variant="ghost" icon={<Download size={16} />} onClick={() => toast.info('Download simulado', 'Na versão de produção o PDF é gerado pelo banco emissor.')}>Baixar PDF</Button>
            <Button variant="primary" onClick={() => setDetail(null)}>Fechar</Button>
          </>
        }
      >
        {detail && (
          <div className="nx-stack nx-gap-5">
            <DetailList
              columns={2}
              items={[
                { label: 'Valor', value: <strong>{currency(detail.amount)}</strong> },
                { label: 'Vencimento', value: formatDate(detail.dueDate) },
                { label: 'Status', value: <Badge tone={invoiceTone(detail.status)} size="sm">{INVOICE_STATUS_LABEL[detail.status]}</Badge> },
                { label: 'Pagamento', value: detail.paidAt ? formatDate(detail.paidAt) : '—' },
              ]}
            />

            <div>
              <p className="nx-uppercase nx-text-subtle" style={{ marginBottom: 'var(--space-2)' }}>Composição</p>
              {detail.items.map((item) => (
                <div key={item.label} className="nx-confirm-row">
                  <span>{item.label}</span>
                  <strong>{currency(item.amount)}</strong>
                </div>
              ))}
            </div>

            <div className="nx-barcode">
              <p className="nx-uppercase nx-text-subtle">Linha digitável</p>
              <p className="nx-mono nx-barcode__line">{detail.barcode}</p>
              <Button
                variant="secondary"
                size="sm"
                icon={<Copy size={14} />}
                onClick={() => { navigator.clipboard?.writeText(detail.barcode); toast.success('Linha digitável copiada'); }}
              >
                Copiar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Pagamento simulado ---------- */}
      <Modal
        open={paying !== null}
        onClose={() => !processing && setPaying(null)}
        title="Pagar boleto"
        subtitle={paying ? `${paying.reference} · ${currency(paying.amount)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaying(null)} disabled={processing}>Cancelar</Button>
            <Button variant="brand" loading={processing} onClick={confirmPayment}>Confirmar pagamento</Button>
          </>
        }
      >
        {paying && (
          <div className="nx-stack nx-center nx-gap-4" style={{ textAlign: 'center' }}>
            <QRCode value={`PIX-${paying.id}-${paying.amount}`} size={168} />
            <p className="nx-text-sm nx-text-muted">
              Aponte a câmera do seu banco para o QR Code ou copie a linha digitável.
            </p>
            <div className="nx-pill-note">
              <QrCode size={14} />
              Integração bancária real prevista para a Fase 3. Neste ambiente o pagamento é simulado.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
