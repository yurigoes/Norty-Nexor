import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { FileRef, Permission } from '@nortycar/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import { CryptoService } from '../../common/crypto.service';
import { AuditService } from '../../common/audit.service';
import type { OrgContext, RequestContext } from '../../common/context';

/**
 * Entidades que aceitam anexos e a permissão exigida para ler e anexar.
 * Documento pessoal (cliente, motorista) exige `customers.sensitive`.
 */
export const FILE_ENTITIES: Record<string, { read: Permission; write: Permission; table: string }> = {
  VehicleUnit: { read: 'fleet.view', write: 'fleet.documents', table: 'vehicleUnit' },
  VehicleModel: { read: 'fleet.view', write: 'catalog.manage', table: 'vehicleModel' },
  Customer: { read: 'customers.sensitive', write: 'customers.edit', table: 'customer' },
  Driver: { read: 'customers.sensitive', write: 'customers.edit', table: 'driver' },
  RentalContract: { read: 'contracts.view', write: 'contracts.edit', table: 'rentalContract' },
  Inspection: { read: 'inspections.view', write: 'inspections.perform', table: 'inspection' },
  WorkOrder: { read: 'maintenance.view', write: 'maintenance.manage', table: 'workOrder' },
  TrafficInfraction: { read: 'infractions.view', write: 'infractions.manage', table: 'trafficInfraction' },
  Claim: { read: 'claims.view', write: 'claims.manage', table: 'claim' },
  InsurancePolicy: { read: 'claims.view', write: 'claims.manage', table: 'insurancePolicy' },
  Payable: { read: 'finance.view', write: 'finance.payables', table: 'payable' },
  Receivable: { read: 'finance.view', write: 'finance.receivables', table: 'receivable' },
  DepositEntry: { read: 'deposits.view', write: 'deposits.manage', table: 'depositEntry' },
  RefuelRecord: { read: 'refuel.view', write: 'refuel.manage', table: 'refuelRecord' },
  VehicleSale: { read: 'sales.view', write: 'sales.manage', table: 'vehicleSale' },
  SiteConfig: { read: 'site.manage', write: 'site.manage', table: 'siteConfig' },
  PurchaseOrder: { read: 'inventory.view', write: 'purchases.manage', table: 'purchaseOrder' },
};

/** Arquivos que podem aparecer no site público (fotos de catálogo, logo). */
const PUBLIC_ENTITIES = new Set(['VehicleModel', 'SiteConfig']);

export interface UploadInput {
  entityType: string;
  entityId?: string;
  category?: string;
  description?: string;
  expiresAt?: string;
  customerVisible?: boolean;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  rule(entityType: string) {
    const rule = FILE_ENTITIES[entityType];
    if (!rule) throw new BadRequestException('Tipo de entidade não aceita anexos.');
    return rule;
  }

  async upload(ctx: OrgContext, file: { buffer: Buffer; originalname: string } | undefined, input: UploadInput): Promise<FileRef> {
    if (!file) throw new BadRequestException('Envie o arquivo no campo "file".');
    const rule = this.rule(input.entityType);
    if (!ctx.permissions.has(rule.write)) throw new ForbiddenException('Sem permissão para anexar arquivos aqui.');
    const allowed = input.entityType === 'VehicleModel' && input.category === 'model3d' ? ['model/gltf-binary'] : undefined;

    return this.prisma.tenant(ctx, async (tx) => {
      if (input.entityId) await this.assertEntity(tx, input.entityType, input.entityId, ctx);
      const stored = await this.storage.put(ctx.organizationId, file.buffer, allowed);
      const record = await tx.fileAsset.create({
        data: {
          organizationId: ctx.organizationId,
          storageKey: stored.storageKey,
          originalName: sanitizeName(file.originalname),
          mimeType: stored.mimeType,
          size: stored.size,
          sha256: stored.sha256,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          category: input.category ?? null,
          description: input.description ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          customerVisible: input.customerVisible ?? false,
          uploadedById: ctx.userId,
        },
      });
      await this.audit.record(tx, ctx, {
        action: 'file.uploaded', entityType: input.entityType, entityId: input.entityId,
        after: { fileId: record.id, name: record.originalName, category: record.category, sha256: record.sha256 },
      });
      return toRef(record);
    });
  }

  async list(ctx: OrgContext, entityType: string, entityId: string): Promise<FileRef[]> {
    const rule = this.rule(entityType);
    if (!ctx.permissions.has(rule.read)) throw new ForbiddenException('Sem permissão para ver estes arquivos.');
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertEntity(tx, entityType, entityId, ctx);
      const files = await tx.fileAsset.findMany({ where: { entityType, entityId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
      return files.map(toRef);
    });
  }

  /** Lê o arquivo depois de conferir a permissão da entidade dona dele. */
  async read(ctx: RequestContext, id: string) {
    if (!ctx.organizationId) throw new ForbiddenException('Selecione uma empresa.');
    const file = await this.prisma.tenant({ organizationId: ctx.organizationId }, (tx) => tx.fileAsset.findUnique({ where: { id } }));
    if (!file || file.deletedAt) throw new NotFoundException('Arquivo não encontrado.');
    if (ctx.kind === 'CUSTOMER') {
      await this.assertCustomerAccess(ctx, file);
    } else {
      const rule = this.rule(file.entityType);
      if (!ctx.permissions.has(rule.read) && !PUBLIC_ENTITIES.has(file.entityType)) {
        throw new ForbiddenException('Sem permissão para abrir este arquivo.');
      }
    }
    return { file, buffer: await this.storage.get(file.storageKey) };
  }

  /** URL temporária (5 min) para <img> e downloads — o token não vai na URL. */
  async signedUrl(ctx: RequestContext, id: string): Promise<{ url: string; expiresAt: string }> {
    await this.read(ctx, id);
    const exp = Date.now() + 5 * 60_000;
    const sig = this.crypto.sign(`${id}.${exp}`);
    return { url: `/v1/files/${id}/raw?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp).toISOString() };
  }

  async readSigned(id: string, exp: string, sig: string) {
    const expires = Number(exp);
    if (!expires || expires < Date.now() || !this.crypto.verify(`${id}.${expires}`, sig ?? '')) {
      throw new ForbiddenException('Link expirado. Abra o arquivo novamente.');
    }
    const file = await this.prisma.platform((tx) => tx.fileAsset.findUnique({ where: { id } }));
    if (!file || file.deletedAt) throw new NotFoundException('Arquivo não encontrado.');
    return { file, buffer: await this.storage.get(file.storageKey) };
  }

  /** Arquivo público: só fotos de catálogo e marca do site publicado. */
  async readPublic(organizationId: string, id: string) {
    const file = await this.prisma.platform((tx) => tx.fileAsset.findUnique({ where: { id } }));
    if (!file || file.deletedAt || file.organizationId !== organizationId || !PUBLIC_ENTITIES.has(file.entityType)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return { file, buffer: await this.storage.get(file.storageKey) };
  }

  /** Exclusão lógica: o arquivo some das listas, mas a evidência permanece. */
  async remove(ctx: OrgContext, id: string, reason: string): Promise<void> {
    await this.prisma.tenant(ctx, async (tx) => {
      const file = await tx.fileAsset.findUnique({ where: { id } });
      if (!file || file.deletedAt) throw new NotFoundException('Arquivo não encontrado.');
      const rule = this.rule(file.entityType);
      if (!ctx.permissions.has(rule.write)) throw new ForbiddenException('Sem permissão para remover este arquivo.');
      if (file.entityType === 'Inspection') throw new ForbiddenException('Fotos e documentos de vistoria não podem ser removidos.');
      await tx.fileAsset.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'file.removed', entityType: file.entityType, entityId: file.entityId, reason, before: { fileId: id, name: file.originalName } });
    });
  }

  private async assertEntity(tx: Tx, entityType: string, entityId: string, ctx: RequestContext): Promise<void> {
    const rule = this.rule(entityType);
    const delegate = (tx as unknown as Record<string, { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> }>)[rule.table];
    const where = entityType === 'SiteConfig' ? { organizationId: entityId } : { id: entityId };
    const row = await delegate!.findUnique({ where });
    if (!row) throw new NotFoundException('Registro de destino não encontrado.');
    const branchId = row['branchId'];
    if (typeof branchId === 'string' && !ctx.allBranches && !ctx.branchIds.includes(branchId)) {
      throw new ForbiddenException('Sem acesso a esta filial.');
    }
  }

  /**
   * Cliente só abre arquivo liberado (customerVisible) e ligado a algo
   * que é dele: um contrato seu ou uma vistoria de contrato seu.
   */
  private async assertCustomerAccess(ctx: RequestContext, file: { entityType: string; entityId: string | null; customerVisible: boolean }): Promise<void> {
    const deny = new ForbiddenException('Arquivo não disponível.');
    if (!file.customerVisible || !file.entityId) throw deny;
    const owned = await this.prisma.tenant({ organizationId: ctx.organizationId! }, async (tx) => {
      if (file.entityType === 'RentalContract') {
        return Boolean(await tx.rentalContract.findFirst({ where: { id: file.entityId!, customerId: ctx.customerId } }));
      }
      if (file.entityType === 'Inspection') {
        return Boolean(await tx.inspection.findFirst({ where: { id: file.entityId!, visibleToCustomer: true, contract: { customerId: ctx.customerId } } }));
      }
      if (file.entityType === 'Receivable') {
        return Boolean(await tx.receivable.findFirst({ where: { id: file.entityId!, customerId: ctx.customerId } }));
      }
      return false;
    });
    if (!owned) throw deny;
  }
}

function sanitizeName(name: string): string {
  return (Buffer.from(name ?? 'arquivo', 'latin1').toString('utf8') || 'arquivo').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 160);
}

export function toRef(f: { id: string; originalName: string; mimeType: string; size: number; category: string | null; expiresAt: Date | null; createdAt: Date }): FileRef {
  return {
    id: f.id, name: f.originalName, mimeType: f.mimeType, size: f.size, category: f.category,
    expiresAt: f.expiresAt ? f.expiresAt.toISOString().slice(0, 10) : null, createdAt: f.createdAt.toISOString(),
  };
}
