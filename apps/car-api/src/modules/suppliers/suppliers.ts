import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength,
} from 'class-validator';
import { isValidCnpj, isValidCpf, onlyDigits, type Permission } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { OrgCtx, type OrgContext } from '../../common/context';
import { PageQueryDto, orderBy, pageArgs, paginated } from '../../common/pagination';

export const SUPPLIER_KINDS = ['WORKSHOP', 'PARTS', 'INSURER', 'FUEL', 'DEALER', 'SERVICES', 'TAX', 'OTHER'] as const;

class SupplierDto {
  @IsString() @Length(2, 160) name!: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsIn(SUPPLIER_KINDS, { each: true }) kinds?: string[];
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @Length(2, 2) state?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class UpdateSupplierDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsIn(SUPPLIER_KINDS, { each: true }) kinds?: string[];
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @Length(2, 2) state?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class SupplierQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(SUPPLIER_KINDS) kind?: string;
  @IsOptional() @IsIn(['true', 'false']) includeInactive?: string;
}

/** Quem cadastra fornecedor: financeiro, estoque, compras, seguros ou frota. Basta uma. */
const WRITERS: Permission[] = ['finance.payables', 'inventory.manage', 'purchases.manage', 'claims.manage', 'fleet.create'];

function normalizeDocument(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const digits = onlyDigits(value);
  if (digits.length === 11 ? !isValidCpf(digits) : digits.length === 14 ? !isValidCnpj(digits) : true) {
    throw new BadRequestException('CPF ou CNPJ do fornecedor inválido.');
  }
  return digits;
}

/**
 * Fornecedores: oficinas, peças, seguradoras, postos, concessionárias.
 * Cadastro único da empresa, compartilhado por frota, estoque, OS,
 * seguros e contas a pagar.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(ctx: OrgContext, q: SupplierQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.SupplierWhereInput = {
      ...(q.includeInactive === 'true' ? {} : { active: true }),
      ...(q.kind ? { kinds: { has: q.kind } } : {}),
      ...(q.q ? { OR: [
        { name: { contains: q.q, mode: 'insensitive' } },
        { document: { contains: onlyDigits(q.q) || q.q } },
        { contactName: { contains: q.q, mode: 'insensitive' } },
      ] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [items, total] = await Promise.all([
        tx.supplier.findMany({ where, skip, take, orderBy: orderBy(q, ['name', 'createdAt'], { name: 'asc' }) }),
        tx.supplier.count({ where }),
      ]);
      return paginated(items, total, page, pageSize);
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const s = await tx.supplier.findUnique({ where: { id }, include: { _count: { select: { payables: true, workOrders: true, purchaseOrders: true } } } });
      if (!s) throw new NotFoundException('Fornecedor não encontrado.');
      return s;
    });
  }

  create(ctx: OrgContext, dto: SupplierDto) {
    this.assertWriter(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const s = await tx.supplier.create({
        data: { ...dto, document: normalizeDocument(dto.document) ?? null, state: dto.state?.toUpperCase(), kinds: dto.kinds ?? [], organizationId: ctx.organizationId },
      });
      await this.audit.record(tx, ctx, { action: 'supplier.created', entityType: 'Supplier', entityId: s.id, after: dto });
      return s;
    });
  }

  update(ctx: OrgContext, id: string, dto: UpdateSupplierDto) {
    this.assertWriter(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.supplier.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Fornecedor não encontrado.');
      const data = { ...dto, ...(dto.document !== undefined ? { document: normalizeDocument(dto.document) ?? null } : {}), ...(dto.state ? { state: dto.state.toUpperCase() } : {}) };
      const s = await tx.supplier.update({ where: { id }, data });
      await this.audit.record(tx, ctx, { action: 'supplier.updated', entityType: 'Supplier', entityId: id, ...AuditService.diff(before as never, data as never) });
      return s;
    });
  }

  private assertWriter(ctx: OrgContext) {
    if (!WRITERS.some((p) => ctx.permissions.has(p))) throw new ForbiddenException('Seu perfil não pode cadastrar fornecedores.');
  }
}

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  /** Leitura aberta à equipe: nome de fornecedor não é dado sensível e aparece em várias telas. */
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() q: SupplierQueryDto) {
    return this.suppliers.list(ctx, q);
  }

  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(ctx, id);
  }

  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: SupplierDto) {
    return this.suppliers.create(ctx, dto);
  }

  @Patch(':id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(ctx, id, dto);
  }
}

@Module({ controllers: [SuppliersController], providers: [SuppliersService] })
export class SuppliersModule {}
