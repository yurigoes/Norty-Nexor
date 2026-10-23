/**
 * Cenários dos testes de regularização e indicadores, criados direto no
 * banco (bypass de RLS). Dados sintéticos: placas, CPFs e RENAVAMs
 * gerados com dígito válido, sem relação com pessoas ou veículos reais.
 */
import { asPlatform } from './db';
import { fakeCpf, fakePlate, fakeRenavam, fakeVin, unique } from './helpers';

export async function createVehicle(organizationId: string, branchId: string, extra: Record<string, unknown> = {}) {
  return asPlatform(async (tx) => {
    const model = await tx.vehicleModel.findFirstOrThrow({ where: { organizationId } });
    return tx.vehicleUnit.create({
      data: {
        organizationId, branchId, modelId: model.id, categoryId: model.categoryId, internalCode: unique('V'),
        plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin(), yearManufacture: 2024, yearModel: 2025,
        color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', odometerKm: 1000, initialOdometerKm: 1000, ...extra,
      },
    });
  });
}

export async function createCustomerAndDriver(organizationId: string, cnhExpiresAt = new Date(Date.now() + 400 * 86_400_000)) {
  return asPlatform(async (tx) => {
    const cpf = fakeCpf();
    const customer = await tx.customer.create({ data: { organizationId, type: 'PF', name: `Cliente ${unique('c')}`, document: cpf, email: `${unique('c')}@teste.test` } });
    const driver = await tx.driver.create({
      data: { organizationId, customerId: customer.id, name: `Motorista ${unique('m')}`, cpf, cnhNumber: unique('cnh'), cnhCategory: 'B', cnhExpiresAt },
    });
    return { customer, driver };
  });
}

/** Contrato em vigor com o veículo e o motorista, desde `startAt`. */
export async function createActiveContract(organizationId: string, branchId: string, vehicleUnitId: string, customerId: string, driverId: string, startAt: Date, endAt: Date) {
  return asPlatform(async (tx) => {
    const contract = await tx.rentalContract.create({
      data: {
        organizationId, branchId, number: unique('CTR'), kind: 'PERIOD', status: 'ACTIVE', customerId, startAt, endAt,
        actualStartAt: startAt, totalAmount: 1000,
      },
    });
    await tx.contractVehicle.create({ data: { organizationId, contractId: contract.id, vehicleUnitId, startAt } });
    await tx.contractDriver.create({ data: { organizationId, contractId: contract.id, driverId, startAt } });
    await tx.vehicleAllocation.create({
      data: { organizationId, vehicleUnitId, kind: 'CONTRACT', startsAt: startAt, endsAt: endAt, blockedUntil: endAt },
    });
    return contract;
  });
}
