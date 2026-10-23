/**
 * Regras configuráveis por empresa, gravadas em `organizations.settings`.
 * Valores ausentes caem nos padrões abaixo — nunca em `undefined`.
 */
export interface OrgSettings {
  /** Horas de preparo entre locações (limpeza, vistoria). */
  turnaroundHours: number;
  /** Bloquear locação para cliente com CNH vencida. */
  blockExpiredCnh: boolean;
  /** Dias de antecedência para alertar vencimento de CNH e documentos. */
  documentAlertDays: number;
  /** Exige veículo nas saídas de estoque destes tipos. */
  requireVehicleFor: string[];
  /** Exige OS nas saídas de estoque destes tipos. */
  requireWorkOrderFor: string[];
  /** Depreciação anual da frota em %; nulo = política não definida. */
  annualDepreciationPercent: number | null;
  /** Multa e juros padrão dos contratos. */
  lateFeePercent: number;
  monthlyInterestPercent: number;
  /** Reserva solicitada pelo site expira sem confirmação após N horas. */
  requestExpiryHours: number;
  notificationChannels: { email: boolean; whatsapp: boolean; webhook: boolean };
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  turnaroundHours: 2,
  blockExpiredCnh: true,
  documentAlertDays: 30,
  requireVehicleFor: ['VEHICLE_OUT', 'MAINTENANCE_OUT'],
  requireWorkOrderFor: ['MAINTENANCE_OUT'],
  annualDepreciationPercent: null,
  lateFeePercent: 2,
  monthlyInterestPercent: 1,
  requestExpiryHours: 48,
  notificationChannels: { email: false, whatsapp: false, webhook: false },
};

export function orgSettings(raw: unknown): OrgSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<OrgSettings>) : {};
  return {
    ...DEFAULT_ORG_SETTINGS,
    ...value,
    notificationChannels: { ...DEFAULT_ORG_SETTINGS.notificationChannels, ...(value.notificationChannels ?? {}) },
  };
}
