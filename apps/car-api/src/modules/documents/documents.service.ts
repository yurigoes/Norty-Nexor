import { ForbiddenException, Injectable } from '@nestjs/common';
import { formatPlate, type ExpiringDocument } from '@nortycar/shared';
import { PrismaService } from '../../common/prisma.service';
import { branchWhere, type OrgContext } from '../../common/context';
import { orgSettings } from '../../common/org-settings';

const DAY = 86_400_000;

const FILE_LINK: Record<string, (id: string) => string> = {
  VehicleUnit: (id) => `/frota/veiculos/${id}`,
  Customer: (id) => `/pessoas/clientes/${id}`,
  Driver: (id) => `/pessoas/motoristas?id=${id}`,
};

/**
 * Documentos a vencer, de todas as fontes, numa lista só: CNH, licenciamento,
 * IPVA, anexos com validade e apólices. Cada fonte só entra para quem pode
 * vê-la; vencidos aparecem junto, no topo, porque são os mais urgentes.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async expiring(ctx: OrgContext, requestedDays?: number): Promise<{ days: number; items: ExpiringDocument[] }> {
    const fleet = ctx.permissions.has('fleet.view');
    const people = ctx.permissions.has('customers.view');
    const policies = ctx.permissions.has('claims.view') || fleet;
    if (!fleet && !people) throw new ForbiddenException('Sem permissão para ver documentos.');

    return this.prisma.tenant(ctx, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const days = requestedDays ?? orgSettings(org?.settings).documentAlertDays;
      const now = Date.now();
      const limit = new Date(now + days * DAY);
      const items: ExpiringDocument[] = [];
      const push = (i: Omit<ExpiringDocument, 'daysLeft' | 'dueDate'> & { due: Date }) => {
        const { due, ...rest } = i;
        items.push({ ...rest, dueDate: due.toISOString().slice(0, 10), daysLeft: Math.ceil((due.getTime() - now) / DAY) });
      };

      if (people) {
        const drivers = await tx.driver.findMany({ where: { active: true, anonymizedAt: null, cnhExpiresAt: { lte: limit } }, take: 500 });
        for (const d of drivers) {
          push({ type: 'CNH', label: `CNH de ${d.name}`, reference: `Categoria ${d.cnhCategory}`, due: d.cnhExpiresAt, link: `/pessoas/motoristas?id=${d.id}`, entityId: d.id });
        }
      }

      if (fleet) {
        const vehicles = await tx.vehicleUnit.findMany({
          where: {
            deletedAt: null, commercialStatus: { not: 'SOLD' }, ...branchWhere(ctx),
            OR: [{ licensingDueDate: { lte: limit } }, { ipvaDueDate: { lte: limit } }],
          },
          include: { model: { include: { make: true } } },
          take: 500,
        });
        for (const v of vehicles) {
          const ref = `${formatPlate(v.plate)} · ${v.model.make.name} ${v.model.name}`;
          if (v.licensingDueDate && v.licensingDueDate <= limit) push({ type: 'LICENSING', label: 'Licenciamento', reference: ref, due: v.licensingDueDate, link: `/frota/veiculos/${v.id}`, entityId: v.id });
          if (v.ipvaDueDate && v.ipvaDueDate <= limit) push({ type: 'IPVA', label: 'IPVA', reference: ref, due: v.ipvaDueDate, link: `/frota/veiculos/${v.id}`, entityId: v.id });
        }
      }

      const fileTypes = [...(fleet ? ['VehicleUnit'] : []), ...(people ? ['Customer', 'Driver'] : [])];
      if (fileTypes.length) {
        const files = await tx.fileAsset.findMany({
          where: { deletedAt: null, entityType: { in: fileTypes }, expiresAt: { not: null, lte: limit }, entityId: { not: null } },
          take: 500,
        });
        // Arquivo de veículo de filial não autorizada não entra.
        const vehicleIds = files.filter((f) => f.entityType === 'VehicleUnit').map((f) => f.entityId!);
        const visible = new Map(
          (vehicleIds.length
            ? await tx.vehicleUnit.findMany({ where: { id: { in: vehicleIds }, deletedAt: null, ...branchWhere(ctx) }, select: { id: true, plate: true } })
            : []).map((v) => [v.id, v.plate]),
        );
        for (const f of files) {
          if (f.entityType === 'VehicleUnit' && !visible.has(f.entityId!)) continue;
          const reference = f.entityType === 'VehicleUnit' ? formatPlate(visible.get(f.entityId!)!) : f.originalName;
          push({
            type: 'FILE', label: `Documento${f.category ? ` (${f.category})` : ''}: ${f.description ?? f.originalName}`, reference,
            due: f.expiresAt!, link: FILE_LINK[f.entityType]!(f.entityId!), entityId: f.entityId!,
          });
        }
      }

      if (policies) {
        const list = await tx.insurancePolicy.findMany({ where: { active: true, endsAt: { lte: limit } }, include: { insurer: true }, take: 200 });
        for (const p of list) {
          push({ type: 'INSURANCE', label: `Apólice ${p.policyNumber}`, reference: p.insurer.name, due: p.endsAt, link: '/regularizacao/seguros', entityId: p.id });
        }
      }

      items.sort((a, b) => a.daysLeft - b.daysLeft);
      return { days, items };
    });
  }
}
