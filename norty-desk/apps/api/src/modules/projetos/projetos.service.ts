import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  can,
  type ChamadoDoProjeto,
  type ProjetoDetail,
  type ProjetoView,
  type TarefaDeProjetoView,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type {
  BuscarProjetosDto,
  EditarProjetoDto,
  EditarTarefaProjetoDto,
  EscreverProjetoDto,
  EscreverTarefaProjetoDto,
} from './dto';

const INCLUDE_PROJETO = {
  manager: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  parent: { select: { id: true, name: true, code: true } },
  tasks: { select: { status: true, percentDone: true, plannedMinutes: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.ProjectInclude;
type ProjetoComRelacoes = Prisma.ProjectGetPayload<{ include: typeof INCLUDE_PROJETO }>;

const INCLUDE_TAREFA = {
  assignee: { select: { id: true, name: true } },
  dependsOn: { select: { id: true, name: true, status: true } },
} satisfies Prisma.ProjectTaskInclude;
type TarefaComRelacoes = Prisma.ProjectTaskGetPayload<{ include: typeof INCLUDE_TAREFA }>;

const ENCERRADOS = ['CONCLUIDO', 'CANCELADO'] as const;
const CAMPOS_DO_RESPONSAVEL = new Set(['status', 'percentDone', 'addSpentMinutes']);

const data = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

/**
 * Projetos, tarefas de projeto e o vínculo com chamados.
 *
 * O percentual do projeto sai das tarefas — ninguém o digita —, e o custo
 * é a soma dos custos dos chamados vinculados. Os chamados passam pelo
 * mesmo escopo de leitura da fila: o projeto não é porta lateral para ler
 * chamado alheio.
 */
@Injectable()
export class ProjetosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(usuario: UsuarioAutenticado, filtro: BuscarProjetosDto): Promise<ProjetoView[]> {
    const termo = filtro.q?.trim();
    const projetos = await this.prisma.project.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.status
          ? { status: filtro.status }
          : filtro.incluirEncerrados
            ? {}
            : { status: { notIn: [...ENCERRADOS] } }),
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                { code: { contains: termo, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: INCLUDE_PROJETO,
      orderBy: [{ priority: 'desc' }, { plannedEnd: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      take: 500,
    });
    return projetos.map((p) => ProjetosService.paraView(p));
  }

  async detalhe(usuario: UsuarioAutenticado, id: string): Promise<ProjetoDetail> {
    const projeto = await this.prisma.project.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE_PROJETO,
    });
    if (!projeto) throw new NotFoundException('Projeto não encontrado.');

    const lerCusto = can(usuario.role, 'custo:ler');
    const [tarefas, vinculos, filhos, custo] = await Promise.all([
      this.prisma.projectTask.findMany({
        where: { projectId: id },
        include: INCLUDE_TAREFA,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.projectTicket.findMany({
        where: { projectId: id, ticket: escopoDeLeitura(usuario) },
        include: { ticket: { select: { id: true, number: true, subject: true, status: true } } },
        orderBy: { addedAt: 'asc' },
      }),
      this.prisma.project.findMany({
        where: { parentId: id, organizationId: usuario.organizationId },
        include: INCLUDE_PROJETO,
        orderBy: { name: 'asc' },
      }),
      lerCusto
        ? this.prisma.ticketCost.aggregate({
            where: { ticket: { projects: { some: { projectId: id } } } },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      ...ProjetosService.paraView(projeto),
      tasks: tarefas.map((t) => ProjetosService.tarefaParaView(t)),
      tickets: vinculos.map((v): ChamadoDoProjeto => ({ ...v.ticket, status: String(v.ticket.status) })),
      children: filhos.map((p) => ProjetosService.paraView(p)),
      totalCost: custo ? (custo._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) : null,
    };
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverProjetoDto, ip?: string): Promise<ProjetoDetail> {
    await this.exigirReferenciasDoProjeto(usuario, dto);
    await this.exigirCodigoLivre(usuario, dto.code);
    ProjetosService.exigirDatas(dto.plannedStart, dto.plannedEnd);

    const status = dto.status ?? 'PLANEJADO';
    const projeto = await this.prisma.project.create({
      data: {
        organizationId: usuario.organizationId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        description: dto.description ?? null,
        status,
        priority: dto.priority ?? 3,
        managerId: dto.managerId ?? null,
        teamId: dto.teamId ?? null,
        parentId: dto.parentId ?? null,
        plannedStart: data(dto.plannedStart) ?? null,
        plannedEnd: data(dto.plannedEnd) ?? null,
        realStart: status === 'EM_ANDAMENTO' || status === 'CONCLUIDO' ? new Date() : null,
        realEnd: status === 'CONCLUIDO' ? new Date() : null,
      },
    });
    await this.auditoria.registrar(usuario, {
      action: 'projeto.criado',
      entity: 'Project',
      entityId: projeto.id,
      ip,
      depois: { name: projeto.name, code: projeto.code, status: projeto.status },
    });
    return this.detalhe(usuario, projeto.id);
  }

  async editar(usuario: UsuarioAutenticado, id: string, dto: EditarProjetoDto, ip?: string): Promise<ProjetoDetail> {
    const antes = await this.exigirProjeto(usuario, id);
    await this.exigirReferenciasDoProjeto(usuario, dto);
    if (dto.code !== undefined) await this.exigirCodigoLivre(usuario, dto.code, id);
    if (dto.parentId) await this.exigirSemCicloDeProjeto(id, dto.parentId);
    ProjetosService.exigirDatas(
      dto.plannedStart === undefined ? antes.plannedStart?.toISOString() : dto.plannedStart,
      dto.plannedEnd === undefined ? antes.plannedEnd?.toISOString() : dto.plannedEnd,
    );

    // Real começa e termina sozinho: é o que o GLPI pede para digitar e
    // ninguém digita.
    const status = dto.status ?? antes.status;
    const depois = await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        code: dto.code === undefined ? undefined : dto.code?.trim() || null,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        managerId: dto.managerId,
        teamId: dto.teamId,
        parentId: dto.parentId,
        plannedStart: data(dto.plannedStart),
        plannedEnd: data(dto.plannedEnd),
        ...(status !== 'PLANEJADO' && !antes.realStart ? { realStart: new Date() } : {}),
        ...(status === 'CONCLUIDO' && !antes.realEnd ? { realEnd: new Date() } : {}),
        ...(status !== 'CONCLUIDO' && antes.realEnd ? { realEnd: null } : {}),
      },
    });
    await this.auditoria.registrar(usuario, {
      action: 'projeto.editado',
      entity: 'Project',
      entityId: id,
      ip,
      antes: { name: antes.name, status: antes.status, managerId: antes.managerId, plannedEnd: antes.plannedEnd?.toISOString() ?? null },
      depois: { name: depois.name, status: depois.status, managerId: depois.managerId, plannedEnd: depois.plannedEnd?.toISOString() ?? null },
    });
    return this.detalhe(usuario, id);
  }

  /** Excluir só projeto vazio; com tarefa ou chamado, o caminho é cancelar. */
  async remover(usuario: UsuarioAutenticado, id: string, ip?: string): Promise<void> {
    const projeto = await this.exigirProjeto(usuario, id);
    const [tarefas, chamados] = await Promise.all([
      this.prisma.projectTask.count({ where: { projectId: id } }),
      this.prisma.projectTicket.count({ where: { projectId: id } }),
    ]);
    if (tarefas || chamados) {
      throw new ConflictException(`O projeto tem ${tarefas} tarefa(s) e ${chamados} chamado(s): cancele em vez de excluir.`);
    }
    await this.prisma.project.delete({ where: { id } });
    await this.auditoria.registrar(usuario, {
      action: 'projeto.excluido',
      entity: 'Project',
      entityId: id,
      ip,
      antes: { name: projeto.name, code: projeto.code },
    });
  }

  // -------------------------------------------------------------------
  // Tarefas
  // -------------------------------------------------------------------

  async criarTarefa(usuario: UsuarioAutenticado, projectId: string, dto: EscreverTarefaProjetoDto): Promise<ProjetoDetail> {
    const projeto = await this.exigirProjeto(usuario, projectId);
    await this.exigirReferenciasDaTarefa(usuario, projectId, dto);
    ProjetosService.exigirDatas(dto.plannedStart, dto.plannedEnd);

    const status = dto.status ?? 'A_FAZER';
    const ultima = await this.prisma.projectTask.aggregate({
      where: { projectId, status },
      _max: { position: true },
    });

    await this.prisma.projectTask.create({
      data: {
        projectId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        status,
        assigneeId: dto.assigneeId ?? null,
        parentId: dto.parentId ?? null,
        plannedStart: data(dto.plannedStart) ?? null,
        plannedEnd: data(dto.plannedEnd) ?? null,
        plannedMinutes: dto.plannedMinutes ?? null,
        percentDone: status === 'CONCLUIDA' ? 100 : (dto.percentDone ?? 0),
        spentMinutes: dto.addSpentMinutes ?? 0,
        position: dto.position ?? (ultima._max.position ?? -1) + 1,
        dependsOnId: dto.dependsOnId ?? null,
        completedAt: status === 'CONCLUIDA' ? new Date() : null,
      },
    });
    await this.iniciarProjetoSeFor(projeto, status);
    return this.detalhe(usuario, projectId);
  }

  /**
   * Quem gerencia projetos edita tudo. O responsável pela tarefa, só a
   * situação, o percentual e as horas dela — é quem sabe onde ela está.
   */
  async editarTarefa(
    usuario: UsuarioAutenticado,
    projectId: string,
    taskId: string,
    dto: EditarTarefaProjetoDto,
  ): Promise<ProjetoDetail> {
    const projeto = await this.exigirProjeto(usuario, projectId);
    const tarefa = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada neste projeto.');

    if (!can(usuario.role, 'projeto:gerenciar')) {
      if (tarefa.assigneeId !== usuario.userId) {
        throw new ForbiddenException('Só o responsável pela tarefa, ou quem gerencia projetos, pode mudá-la.');
      }
      const alheios = Object.entries(dto).filter(([k, v]) => v !== undefined && !CAMPOS_DO_RESPONSAVEL.has(k));
      if (alheios.length) {
        throw new ForbiddenException('Quem não gerencia projetos só atualiza situação, percentual e horas das próprias tarefas.');
      }
    }

    await this.exigirReferenciasDaTarefa(usuario, projectId, dto);
    if (dto.dependsOnId) await this.exigirSemCicloDeTarefa(taskId, dto.dependsOnId, 'dependsOnId');
    if (dto.parentId) await this.exigirSemCicloDeTarefa(taskId, dto.parentId, 'parentId');
    ProjetosService.exigirDatas(
      dto.plannedStart === undefined ? tarefa.plannedStart?.toISOString() : dto.plannedStart,
      dto.plannedEnd === undefined ? tarefa.plannedEnd?.toISOString() : dto.plannedEnd,
    );

    const status = dto.status ?? tarefa.status;
    const concluiuAgora = status === 'CONCLUIDA' && tarefa.status !== 'CONCLUIDA';
    const reabriu = status !== 'CONCLUIDA' && tarefa.status === 'CONCLUIDA';

    await this.prisma.projectTask.update({
      where: { id: taskId },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        status: dto.status,
        assigneeId: dto.assigneeId,
        parentId: dto.parentId,
        plannedStart: data(dto.plannedStart),
        plannedEnd: data(dto.plannedEnd),
        plannedMinutes: dto.plannedMinutes,
        percentDone: concluiuAgora ? 100 : dto.percentDone,
        ...(dto.addSpentMinutes ? { spentMinutes: { increment: dto.addSpentMinutes } } : {}),
        position: dto.position,
        dependsOnId: dto.dependsOnId,
        ...(concluiuAgora ? { completedAt: new Date() } : {}),
        ...(reabriu ? { completedAt: null } : {}),
      },
    });
    await this.iniciarProjetoSeFor(projeto, status);
    return this.detalhe(usuario, projectId);
  }

  async removerTarefa(usuario: UsuarioAutenticado, projectId: string, taskId: string): Promise<ProjetoDetail> {
    await this.exigirProjeto(usuario, projectId);
    const apagadas = await this.prisma.projectTask.deleteMany({ where: { id: taskId, projectId } });
    if (!apagadas.count) throw new NotFoundException('Tarefa não encontrada neste projeto.');
    return this.detalhe(usuario, projectId);
  }

  // -------------------------------------------------------------------
  // Chamados
  // -------------------------------------------------------------------

  async vincularChamado(usuario: UsuarioAutenticado, projectId: string, numero: number): Promise<ProjetoDetail> {
    await this.exigirProjeto(usuario, projectId);
    // Pelo escopo de leitura: vincular não pode servir para descobrir que
    // um chamado alheio existe.
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { number: numero }] },
      select: { id: true },
    });
    if (!chamado) throw new NotFoundException(`Chamado #${numero} não encontrado (ou fora do que você pode ver).`);
    try {
      await this.prisma.projectTicket.create({ data: { projectId, ticketId: chamado.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`O chamado #${numero} já está neste projeto.`);
      }
      throw e;
    }
    return this.detalhe(usuario, projectId);
  }

  async desvincularChamado(usuario: UsuarioAutenticado, projectId: string, ticketId: string): Promise<ProjetoDetail> {
    await this.exigirProjeto(usuario, projectId);
    await this.prisma.projectTicket.deleteMany({ where: { projectId, ticketId } });
    return this.detalhe(usuario, projectId);
  }

  // -------------------------------------------------------------------
  // Visões
  // -------------------------------------------------------------------

  static percentual(tarefas: { status: string; percentDone: number; plannedMinutes: number | null }[], status: string): number {
    if (tarefas.length === 0) return status === 'CONCLUIDO' ? 100 : 0;
    let peso = 0;
    let feito = 0;
    for (const t of tarefas) {
      const p = t.plannedMinutes && t.plannedMinutes > 0 ? t.plannedMinutes : 1;
      peso += p;
      feito += p * (t.status === 'CONCLUIDA' ? 100 : t.percentDone);
    }
    return Math.round(feito / peso);
  }

  static paraView(p: ProjetoComRelacoes, agora = new Date()): ProjetoView {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      manager: p.manager,
      team: p.team,
      parent: p.parent,
      plannedStart: p.plannedStart?.toISOString() ?? null,
      plannedEnd: p.plannedEnd?.toISOString() ?? null,
      realStart: p.realStart?.toISOString() ?? null,
      realEnd: p.realEnd?.toISOString() ?? null,
      percentDone: ProjetosService.percentual(p.tasks, p.status),
      taskCount: p.tasks.length,
      openTaskCount: p.tasks.filter((t) => t.status !== 'CONCLUIDA').length,
      ticketCount: p._count.tickets,
      late: Boolean(p.plannedEnd && p.plannedEnd < agora && !ENCERRADOS.includes(p.status as never)),
    };
  }

  static tarefaParaView(t: TarefaComRelacoes, agora = new Date()): TarefaDeProjetoView {
    return {
      id: t.id,
      parentId: t.parentId,
      name: t.name,
      description: t.description,
      status: t.status,
      assignee: t.assignee,
      plannedStart: t.plannedStart?.toISOString() ?? null,
      plannedEnd: t.plannedEnd?.toISOString() ?? null,
      plannedMinutes: t.plannedMinutes,
      spentMinutes: t.spentMinutes,
      percentDone: t.percentDone,
      position: t.position,
      dependsOn: t.dependsOn,
      blockedByDependency: Boolean(t.dependsOn && t.dependsOn.status !== 'CONCLUIDA'),
      late: Boolean(t.plannedEnd && t.plannedEnd < agora && t.status !== 'CONCLUIDA'),
      completedAt: t.completedAt?.toISOString() ?? null,
    };
  }

  // -------------------------------------------------------------------

  /** A primeira tarefa em andamento põe o projeto planejado em andamento. */
  private async iniciarProjetoSeFor(projeto: { id: string; status: string; realStart: Date | null }, statusDaTarefa: string) {
    if (projeto.status !== 'PLANEJADO' || statusDaTarefa !== 'EM_ANDAMENTO') return;
    await this.prisma.project.update({
      where: { id: projeto.id },
      data: { status: 'EM_ANDAMENTO', realStart: projeto.realStart ?? new Date() },
    });
  }

  private static exigirDatas(inicio?: string | null, fim?: string | null) {
    if (inicio && fim && new Date(fim) < new Date(inicio)) {
      throw new BadRequestException('O fim previsto não pode ser antes do início.');
    }
  }

  private async exigirProjeto(usuario: UsuarioAutenticado, id: string) {
    const projeto = await this.prisma.project.findFirst({ where: { id, organizationId: usuario.organizationId } });
    if (!projeto) throw new NotFoundException('Projeto não encontrado.');
    return projeto;
  }

  private async exigirCodigoLivre(usuario: UsuarioAutenticado, codigo: string | null | undefined, ignorarId?: string) {
    const c = codigo?.trim();
    if (!c) return;
    const existente = await this.prisma.project.findFirst({
      where: {
        organizationId: usuario.organizationId,
        code: { equals: c, mode: 'insensitive' },
        ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
      },
      select: { name: true },
    });
    if (existente) throw new ConflictException(`O código ${c} já é do projeto "${existente.name}".`);
  }

  private async exigirPessoa(usuario: UsuarioAutenticado, userId: string | null | undefined, papel: string) {
    if (!userId) return;
    const existe = await this.prisma.membership.count({ where: { userId, organizationId: usuario.organizationId } });
    if (!existe) throw new NotFoundException(`${papel} não encontrado(a) nesta organização.`);
  }

  private async exigirReferenciasDoProjeto(
    usuario: UsuarioAutenticado,
    dto: { managerId?: string | null; teamId?: string | null; parentId?: string | null },
  ) {
    await this.exigirPessoa(usuario, dto.managerId, 'Responsável');
    if (dto.teamId && !(await this.prisma.team.count({ where: { id: dto.teamId, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('Time não encontrado nesta organização.');
    }
    if (dto.parentId && !(await this.prisma.project.count({ where: { id: dto.parentId, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('Projeto pai não encontrado nesta organização.');
    }
  }

  private async exigirReferenciasDaTarefa(
    usuario: UsuarioAutenticado,
    projectId: string,
    dto: { assigneeId?: string | null; parentId?: string | null; dependsOnId?: string | null },
  ) {
    await this.exigirPessoa(usuario, dto.assigneeId, 'Responsável');
    for (const [campo, rotulo] of [['parentId', 'Tarefa pai'], ['dependsOnId', 'Predecessora']] as const) {
      const outra = dto[campo];
      if (outra && !(await this.prisma.projectTask.count({ where: { id: outra, projectId } }))) {
        throw new NotFoundException(`${rotulo} não encontrada neste projeto.`);
      }
    }
  }

  /** Sobe a cadeia de pais a partir do novo pai; se chegar ao próprio projeto, é ciclo. */
  private async exigirSemCicloDeProjeto(id: string, novoPai: string) {
    let atual: string | null = novoPai;
    for (let passos = 0; atual && passos < 100; passos++) {
      if (atual === id) throw new ConflictException('Um projeto não pode ser subprojeto de si mesmo nem de um subprojeto seu.');
      const acima: { parentId: string | null } | null = await this.prisma.project.findUnique({
        where: { id: atual },
        select: { parentId: true },
      });
      atual = acima?.parentId ?? null;
    }
  }

  private async exigirSemCicloDeTarefa(id: string, inicio: string, campo: 'parentId' | 'dependsOnId') {
    let atual: string | null = inicio;
    for (let passos = 0; atual && passos < 200; passos++) {
      if (atual === id) {
        throw new ConflictException(
          campo === 'dependsOnId'
            ? 'Essa dependência fecha um ciclo: uma tarefa acabaria esperando por ela mesma.'
            : 'Uma tarefa não pode ser subtarefa de si mesma nem de uma subtarefa sua.',
        );
      }
      const acima: { parentId: string | null; dependsOnId: string | null } | null = await this.prisma.projectTask.findUnique({
        where: { id: atual },
        select: { parentId: true, dependsOnId: true },
      });
      atual = acima ? acima[campo] : null;
    }
  }
}
