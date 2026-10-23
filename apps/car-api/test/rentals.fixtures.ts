/**
 * Cenários de locação montados direto no banco de teste (frota, clientes e
 * vistorias são de outros módulos): veículo, cliente com motorista, tarifa
 * e vistoria concluída. Todos os dados são sintéticos.
 */
import { randomUUID } from 'node:crypto';
import { asPlatform, type TestOrg } from './db';
import { fakeCpf, fakePlate, fakeRenavam, fakeVin } from './helpers';

export async function setupRates(org: TestOrg, categoryCode = 'COMPACTO', extra: Record<string, unknown> = {}) {
  return asPlatform(async (tx) => {
    const category = await tx.vehicleCategory.findFirstOrThrow({ where: { organizationId: org.id, code: categoryCode } });
    const existing = await tx.rateTable.findFirst({ where: { organizationId: org.id, categoryId: category.id, branchId: null } });
    if (!existing) {
      await tx.rateTable.create({
        data: {
          organizationId: org.id, categoryId: category.id, name: `Tarifa ${categoryCode}`, dailyRate: 100, weeklyRate: 600,
          includedKmPerDay: 200, extraKmRate: 1, additionalDriverDaily: 20, lateGraceMinutes: 60, depositAmount: 500,
          longTermMonthly: 2500, longTermKmPerMonth: 2000, ...extra,
        },
      });
    }
    return category.id as string;
  });
}

export async function createVehicle(org: TestOrg, opts: { categoryCode?: string; branchId?: string; operationalStatus?: string; commercialStatus?: string } = {}) {
  return asPlatform(async (tx) => {
    const category = await tx.vehicleCategory.findFirstOrThrow({ where: { organizationId: org.id, code: opts.categoryCode ?? 'COMPACTO' } });
    const model = await tx.vehicleModel.findFirstOrThrow({ where: { organizationId: org.id, categoryId: category.id } });
    return tx.vehicleUnit.create({
      data: {
        organizationId: org.id, branchId: opts.branchId ?? org.branchId, modelId: model.id, categoryId: category.id,
        internalCode: `T-${randomUUID().slice(0, 6)}`, plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin(),
        yearManufacture: 2024, yearModel: 2025, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', odometerKm: 1000,
        operationalStatus: (opts.operationalStatus ?? 'RELEASED') as never, commercialStatus: (opts.commercialStatus ?? 'AVAILABLE') as never,
      },
    });
  });
}

export async function createCustomer(org: TestOrg, opts: { cnhYears?: number; status?: string } = {}) {
  return asPlatform(async (tx) => {
    const cpf = fakeCpf();
    const customer = await tx.customer.create({
      data: { organizationId: org.id, type: 'PF', name: `Cliente Teste ${cpf.slice(0, 4)}`, document: cpf, email: `c${cpf}@teste.test`, status: (opts.status ?? 'ACTIVE') as never },
    });
    const cnh = new Date();
    cnh.setUTCFullYear(cnh.getUTCFullYear() + (opts.cnhYears ?? 5));
    const driver = await tx.driver.create({
      data: {
        organizationId: org.id, customerId: customer.id, name: customer.name, cpf, cnhNumber: `${Date.now()}`.slice(-11),
        cnhCategory: 'B', cnhExpiresAt: new Date(`${cnh.toISOString().slice(0, 10)}T00:00:00.000Z`),
      },
    });
    return { customer, driver };
  });
}

/** Vistoria concluída, como o módulo de vistorias a deixaria. */
export async function completedInspection(org: TestOrg, input: { contractId: string; vehicleUnitId: string; type: 'DELIVERY' | 'RETURN' | 'DRIVER_CHANGE'; odometerKm: number }) {
  return asPlatform(async (tx) => {
    const inspector = await tx.membership.findFirstOrThrow({ where: { organizationId: org.id } });
    return tx.inspection.create({
      data: {
        organizationId: org.id, branchId: org.branchId, number: `VST-${randomUUID().slice(0, 8)}`, type: input.type, status: 'COMPLETED',
        vehicleUnitId: input.vehicleUnitId, contractId: input.contractId, inspectorId: inspector.userId, odometerKm: input.odometerKm,
        fuelEighths: 8, completedAt: new Date(),
      },
    });
  });
}

export const key = () => `teste-${randomUUID()}`;
