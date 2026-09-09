import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type {
  EditarAcordoDto,
  EditarCalendarioDto,
  EditarMotivoDto,
  EscreverAcordoDto,
  EscreverCalendarioDto,
  EscreverMotivoDto,
  EscreverNivelDto,
  FeriadoDto,
} from './dto';

/**
 * Configuração de SLA: acordos, calendários e motivos de pendência.
 *
 * Existiam no schema e na suíte desde a Fase 1, mas só se criavam por
 * SQL — o que na prática significa que ninguém os configurava.
 */
@Injectable()
export class ConfiguracaoSlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Acordos
  // -------------------------------------------------------------------

  async listarAcordos(usuario: UsuarioAutenticado) {
    const acordos = await this.prisma.agreement.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        calendar: { select: { id: true, name: true, timezone: true } },
        levels: { orderBy: { offsetSeconds: 'asc' } },
        _count: { select: { commitments: true, categories: true } },
      },
      orderBy: [{ kind: 'asc' }, { target: 'asc' }, { name: 'asc' }],
    });

    return acordos.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      target: a.target,
      durationSeconds: a.durationSeconds,
      isActive: a.isActive,
      calendar: a.calendar,
      levels: a.levels.map((n) => ({
        id: n.id,
        name: n.name,
        offsetSeconds: n.offsetSeconds,
        criteria: n.criteria,
        actions: n.actions,
      })),
      emUso: a._count.commitments,
      categorias: a._count.categories,
    }));
  }

  async criarAcordo(usuario: UsuarioAutenticado, dto: EscreverAcordoDto, ip?: string) {
    await this.exigirCalendario(usuario, dto.calendarId);

    try {
      const acordo = await this.prisma.agreement.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          kind: dto.kind,
          target: dto.target,
          durationSeconds: dto.durationSeconds,
          calendarId: dto.calendarId ?? null,
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditoria.registrar(usuario, {
        action: 'acordo.criado',
        entity: 'Agreement',
        entityId: acordo.id,
        ip,
        depois: {
          name: acordo.name,
          kind: acordo.kind,
          target: acordo.target,
          durationSeconds: acordo.durationSeconds,
        },
      });

      return acordo;
    } catch (erro) {
      throw ConfiguracaoSlaService.traduzir(erro, 'Já existe um acordo com este nome, tipo e alvo.');
    }
  }

  async editarAcordo(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarAcordoDto,
    ip?: string,
  ) {
    const atual = await this.exigirAcordo(usuario, id);
    await this.exigirCalendario(usuario, dto.calendarId);

    const acordo = await this.prisma.agreement.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.durationSeconds !== undefined ? { durationSeconds: dto.durationSeconds } : {}),
        ...(dto.calendarId !== undefined ? { calendarId: dto.calendarId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    // Mudar prazo é a alteração que mais dói num relatório de SLA. A
    // trilha responde "quem afrouxou isto" seis meses depois — e os
    // compromissos já gravados não mudam (`docs/05-sla.md`, seção 7).
    await this.auditoria.registrar(usuario, {
      action: 'acordo.editado',
      entity: 'Agreement',
      entityId: id,
      ip,
      antes: {
        name: atual.name,
        durationSeconds: atual.durationSeconds,
        calendarId: atual.calendarId,
        isActive: atual.isActive,
      },
      depois: {
        name: acordo.name,
        durationSeconds: acordo.durationSeconds,
        calendarId: acordo.calendarId,
        isActive: acordo.isActive,
      },
    });

    return acordo;
  }

  /**
   * Desativa em vez de excluir.
   *
   * Compromissos gravados apontam para o acordo, e o relatório histórico
   * precisa do nome dele. Excluir apagaria a explicação de um número que
   * continua no relatório.
   */
  async desativarAcordo(usuario: UsuarioAutenticado, id: string, ip?: string): Promise<void> {
    await this.exigirAcordo(usuario, id);
    await this.prisma.agreement.update({ where: { id }, data: { isActive: false } });

    await this.auditoria.registrar(usuario, {
      action: 'acordo.desativado',
      entity: 'Agreement',
      entityId: id,
      ip,
      antes: { isActive: true },
      depois: { isActive: false },
    });
  }

  // --- Níveis de escalonamento ----------------------------------------

  async criarNivel(usuario: UsuarioAutenticado, agreementId: string, dto: EscreverNivelDto) {
    await this.exigirAcordo(usuario, agreementId);

    if (!Array.isArray(dto.actions) || dto.actions.length === 0) {
      throw new BadRequestException(
        'Um nível sem ação não faz nada quando dispara. Informe ao menos uma.',
      );
    }

    try {
      return await this.prisma.escalationLevel.create({
        data: {
          agreementId,
          name: dto.name,
          offsetSeconds: dto.offsetSeconds,
          criteria: (dto.criteria ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          actions: dto.actions as Prisma.InputJsonValue,
        },
      });
    } catch (erro) {
      throw ConfiguracaoSlaService.traduzir(erro, 'Já existe um nível com este nome neste acordo.');
    }
  }

  async removerNivel(usuario: UsuarioAutenticado, agreementId: string, id: string): Promise<void> {
    await this.exigirAcordo(usuario, agreementId);
    await this.prisma.escalationLevel.deleteMany({ where: { id, agreementId } });
  }

  // -------------------------------------------------------------------
  // Calendários
  // -------------------------------------------------------------------

  async listarCalendarios(usuario: UsuarioAutenticado) {
    return this.prisma.calendar.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        segments: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
        holidays: { orderBy: { date: 'asc' } },
        _count: { select: { agreements: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async criarCalendario(usuario: UsuarioAutenticado, dto: EscreverCalendarioDto) {
    const timezone = ConfiguracaoSlaService.exigirFuso(dto.timezone);
    ConfiguracaoSlaService.exigirSegmentosCoerentes(dto.segments);

    try {
      return await this.prisma.calendar.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          timezone,
          ...(dto.segments?.length ? { segments: { create: dto.segments } } : {}),
        },
        include: { segments: true, holidays: true },
      });
    } catch (erro) {
      throw ConfiguracaoSlaService.traduzir(erro, 'Já existe um calendário com este nome.');
    }
  }

  /**
   * Substitui os segmentos inteiros.
   *
   * Editar horário de expediente item a item é como se acaba com duas
   * faixas sobrepostas na terça-feira. Aqui a semana chega inteira e
   * substitui a anterior.
   */
  async editarCalendario(usuario: UsuarioAutenticado, id: string, dto: EditarCalendarioDto) {
    const atual = await this.exigirCalendarioProprio(usuario, id);
    const timezone = dto.timezone ? ConfiguracaoSlaService.exigirFuso(dto.timezone) : atual.timezone;
    ConfiguracaoSlaService.exigirSegmentosCoerentes(dto.segments);

    return this.prisma.$transaction(async (tx) => {
      if (dto.segments) {
        await tx.calendarSegment.deleteMany({ where: { calendarId: id } });
        if (dto.segments.length > 0) {
          await tx.calendarSegment.createMany({
            data: dto.segments.map((s) => ({ ...s, calendarId: id })),
          });
        }
      }

      return tx.calendar.update({
        where: { id },
        data: { name: dto.name ?? atual.name, timezone },
        include: { segments: true, holidays: true },
      });
    });
  }

  async adicionarFeriado(usuario: UsuarioAutenticado, calendarId: string, dto: FeriadoDto) {
    await this.exigirCalendarioProprio(usuario, calendarId);

    try {
      return await this.prisma.holiday.create({
        data: {
          calendarId,
          name: dto.name,
          date: new Date(dto.date),
          isRecurring: dto.isRecurring ?? false,
        },
      });
    } catch (erro) {
      throw ConfiguracaoSlaService.traduzir(erro, 'Já existe um feriado nesta data.');
    }
  }

  async removerFeriado(usuario: UsuarioAutenticado, calendarId: string, id: string): Promise<void> {
    await this.exigirCalendarioProprio(usuario, calendarId);
    await this.prisma.holiday.deleteMany({ where: { id, calendarId } });
  }

  // -------------------------------------------------------------------
  // Motivos de pendência
  // -------------------------------------------------------------------

  async listarMotivos(usuario: UsuarioAutenticado) {
    return this.prisma.pendingReason.findMany({
      where: { organizationId: usuario.organizationId },
      include: { _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async criarMotivo(usuario: UsuarioAutenticado, dto: EscreverMotivoDto) {
    ConfiguracaoSlaService.exigirCobrancaCoerente(dto);

    try {
      return await this.prisma.pendingReason.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          followupIntervalSeconds: dto.followupIntervalSeconds ?? 0,
          followupsBeforeResolution: dto.followupsBeforeResolution ?? 0,
          followupTemplate: dto.followupTemplate ?? null,
          isDefault: dto.isDefault ?? false,
        },
      });
    } catch (erro) {
      throw ConfiguracaoSlaService.traduzir(erro, 'Já existe um motivo com este nome.');
    }
  }

  async editarMotivo(usuario: UsuarioAutenticado, id: string, dto: EditarMotivoDto) {
    const atual = await this.prisma.pendingReason.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!atual) throw new NotFoundException('Motivo não encontrado.');

    ConfiguracaoSlaService.exigirCobrancaCoerente({
      followupIntervalSeconds: dto.followupIntervalSeconds ?? atual.followupIntervalSeconds,
      followupsBeforeResolution:
        dto.followupsBeforeResolution ?? atual.followupsBeforeResolution,
    });

    return this.prisma.pendingReason.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.followupIntervalSeconds !== undefined
          ? { followupIntervalSeconds: dto.followupIntervalSeconds }
          : {}),
        ...(dto.followupsBeforeResolution !== undefined
          ? { followupsBeforeResolution: dto.followupsBeforeResolution }
          : {}),
        ...(dto.followupTemplate !== undefined ? { followupTemplate: dto.followupTemplate } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  async removerMotivo(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const motivo = await this.prisma.pendingReason.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { _count: { select: { tickets: true } } },
    });

    if (!motivo) throw new NotFoundException('Motivo não encontrado.');

    // Chamado pausado aponta para o motivo. Excluir deixaria a tela do
    // chamado sem explicar por que ele está parado.
    if (motivo._count.tickets > 0) {
      throw new ConflictException(
        `${motivo._count.tickets} chamado(s) usam este motivo. ` +
          'Excluir deixaria a tela deles sem explicar por que estão parados.',
      );
    }

    await this.prisma.pendingReason.delete({ where: { id } });
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async exigirAcordo(usuario: UsuarioAutenticado, id: string) {
    const acordo = await this.prisma.agreement.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!acordo) throw new NotFoundException('Acordo não encontrado.');
    return acordo;
  }

  private async exigirCalendarioProprio(usuario: UsuarioAutenticado, id: string) {
    const calendario = await this.prisma.calendar.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!calendario) throw new NotFoundException('Calendário não encontrado.');
    return calendario;
  }

  private async exigirCalendario(usuario: UsuarioAutenticado, id?: string | null) {
    if (!id) return;
    await this.exigirCalendarioProprio(usuario, id);
  }

  /**
   * O fuso tem de existir para o Node.
   *
   * `Intl.DateTimeFormat` com fuso inválido lança — e lançaria no cron
   * de SLA, semanas depois, num prazo calculado errado. Aqui o erro
   * aparece na hora de salvar.
   */
  private static exigirFuso(timezone?: string): string {
    const alvo = timezone?.trim() || 'America/Sao_Paulo';

    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: alvo });
      return alvo;
    } catch {
      throw new BadRequestException(
        `Fuso horário desconhecido: "${alvo}". Use o nome IANA, como America/Sao_Paulo.`,
      );
    }
  }

  /**
   * Faixa que termina antes de começar, ou duas faixas sobrepostas no
   * mesmo dia, quebram o cálculo de expediente em silêncio: o prazo sai
   * menor do que deveria e ninguém liga o defeito à configuração.
   */
  private static exigirSegmentosCoerentes(
    segmentos?: { weekday: number; startMinute: number; endMinute: number }[],
  ): void {
    if (!segmentos?.length) return;

    for (const s of segmentos) {
      if (s.endMinute <= s.startMinute) {
        throw new BadRequestException(
          `No dia ${s.weekday}, o expediente termina antes de começar.`,
        );
      }
    }

    const porDia = new Map<number, { startMinute: number; endMinute: number }[]>();
    for (const s of segmentos) {
      porDia.set(s.weekday, [...(porDia.get(s.weekday) ?? []), s]);
    }

    for (const [dia, faixas] of porDia) {
      const ordenadas = [...faixas].sort((a, b) => a.startMinute - b.startMinute);

      for (let i = 1; i < ordenadas.length; i += 1) {
        if (ordenadas[i]!.startMinute < ordenadas[i - 1]!.endMinute) {
          throw new BadRequestException(
            `No dia ${dia} há duas faixas de expediente sobrepostas: o prazo sairia menor do que o real.`,
          );
        }
      }
    }
  }

  /** Cobrar sem nunca resolver é insistir para sempre. */
  private static exigirCobrancaCoerente(dto: {
    followupIntervalSeconds?: number;
    followupsBeforeResolution?: number;
  }): void {
    const intervalo = dto.followupIntervalSeconds ?? 0;
    const antes = dto.followupsBeforeResolution ?? 0;

    if (intervalo === 0 && antes > 0) {
      throw new BadRequestException(
        'Resolver depois de N cobranças exige um intervalo de cobrança maior que zero.',
      );
    }
  }

  private static traduzir(erro: unknown, mensagem: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(mensagem);
    }
    return erro;
  }
}
