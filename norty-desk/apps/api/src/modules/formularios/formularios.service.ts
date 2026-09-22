import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ErroDeCampo,
  type FormSchema,
  type DestinoDoChamado,
  type FormularioResolvido,
  type FormularioView,
  type ModeloDeChamado,
  type Role,
  can,
  schemaSemInternos,
  validarRespostas,
  validarSchema,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { EditarFormularioDto, EscreverFormularioDto, SchemaDto } from './dto';

const INCLUDE = {
  category: true,
  defaultTeam: { select: { id: true, name: true } },
  defaultAssignee: { select: { id: true, name: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.TicketFormInclude;

type ComRelacoes = Prisma.TicketFormGetPayload<{ include: typeof INCLUDE }>;

/** Teto da subida na árvore de categorias. Ciclo no banco não trava o ciclo aqui. */
const MAX_NIVEIS = 20;

/**
 * Formulário dinâmico por categoria.
 *
 * Substitui as **doze** tabelas `tickettemplate*` do GLPI por um
 * `Json` validado. Lá, o que cada campo é, se é obrigatório, se está
 * escondido e qual o valor padrão vive em quatro tabelas de ligação
 * distintas — e nenhuma delas valida a resposta: o campo obrigatório do
 * template é conferido na tela, e quem abre pela API passa por cima.
 *
 * Aqui o schema é uma coisa só, e `validarRespostas` — função pura de
 * `packages/shared` — roda no aplicativo *e* na API. A tela diz o que
 * falta antes de enviar; a API responde por isso.
 */
@Injectable()
export class FormulariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------

  /**
   * Os modelos que a pessoa escolhe ao abrir chamado.
   *
   * `somentePublicos` é o recorte da tela sem login, e ele corta em
   * dois níveis. A ficha inteira sai quando não está marcada como
   * pública — por isso a marca é própria, e não a ausência de
   * `isModel`. E dentro da que fica, o campo interno ("custo
   * estimado", "contrato") sai do schema: esconder na tela não
   * bastaria, porque é este JSON que o navegador de quem não fez login
   * recebe, e o rótulo do campo interno ia junto.
   *
   * O schema vem junto: escolher o modelo e carregar os campos é um
   * gesto só, e buscá-los numa segunda chamada faria a tela piscar
   * vazia entre o clique e a resposta.
   */
  async modelos(organizationId: string, somentePublicos = false): Promise<ModeloDeChamado[]> {
    const formularios = await this.prisma.ticketForm.findMany({
      where: {
        organizationId,
        isModel: true,
        ...(somentePublicos ? { isPublic: true } : {}),
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return formularios.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      schema: somentePublicos
        ? schemaSemInternos(f.schema as unknown as FormSchema)
        : (f.schema as unknown as FormSchema),
      category: f.category ? { id: f.category.id, name: f.category.name } : null,
    }));
  }

  async listar(usuario: UsuarioAutenticado): Promise<FormularioView[]> {
    const formularios = await this.prisma.ticketForm.findMany({
      where: { organizationId: usuario.organizationId },
      include: INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return formularios.map((f) => FormulariosService.paraView(f));
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<FormularioView> {
    return FormulariosService.paraView(await this.exigir(usuario, id));
  }

  /**
   * O formulário que vale para uma categoria.
   *
   * A busca sobe a árvore antes de cair no padrão da organização: é a
   * herança de template do GLPI, e é o que evita repetir o mesmo
   * formulário em cada subcategoria de "Hardware".
   */
  async resolver(
    organizationId: string,
    categoryId: string | null | undefined,
  ): Promise<FormularioResolvido> {
    if (categoryId) {
      const daCategoria = await this.prisma.ticketForm.findFirst({
        where: { organizationId, categoryId },
        include: INCLUDE,
      });
      if (daCategoria) {
        return { form: FormulariosService.paraView(daCategoria), origem: 'CATEGORIA' };
      }

      let cursor: string | null = categoryId;
      for (let i = 0; i < MAX_NIVEIS && cursor; i += 1) {
        const categoria: { parentId: string | null } | null =
          await this.prisma.category.findFirst({
            where: { id: cursor, organizationId },
            select: { parentId: true },
          });

        cursor = categoria?.parentId ?? null;
        if (!cursor) break;

        const daAcima = await this.prisma.ticketForm.findFirst({
          where: { organizationId, categoryId: cursor },
          include: INCLUDE,
        });
        if (daAcima) {
          return { form: FormulariosService.paraView(daAcima), origem: 'CATEGORIA_ACIMA' };
        }
      }
    }

    const padrao = await this.prisma.ticketForm.findFirst({
      where: { organizationId, isDefault: true },
      include: INCLUDE,
    });

    return padrao
      ? { form: FormulariosService.paraView(padrao), origem: 'PADRAO' }
      : { form: null, origem: 'NENHUM' };
  }

  // -------------------------------------------------------------------
  // Uso na abertura do chamado
  // -------------------------------------------------------------------

  /**
   * Confere as respostas e devolve o que gravar.
   *
   * Devolve `formId` e `customFields` já validados, ou lança 400 com a
   * lista de campos com problema — um erro por campo, e não "requisição
   * inválida", que é o que o GLPI devolve.
   *
   * Campo interno não é oferecido nem aceito no portal: `internal` é
   * "só para quem atende", e deixar o solicitante respondê-lo pela API
   * seria esconder o botão sem fechar a porta.
   */
  async validarAbertura(
    organizationId: string,
    role: Role,
    categoryId: string | null | undefined,
    respostas: Record<string, unknown> | undefined,
    /**
     * O modelo escolhido a dedo, quando houve escolha.
     *
     * Ele vence a herança da categoria, e é contra **ele** que as
     * respostas são conferidas: validar contra um formulário e gravar
     * outro é exatamente o defeito que justificava não aceitar este
     * campo. Aqui os dois são o mesmo, sempre.
     */
    formIdEscolhido?: string | null,
  ): Promise<{
    formId: string | null;
    customFields: Record<string, unknown> | null;
    /**
     * O destino que o modelo **escolhido** carrega.
     *
     * Nulo quando o formulário veio por herança: ficha herdada não
     * redireciona — ver `destinoDoChamado` em packages/shared.
     */
    destinoDoModelo: DestinoDoChamado | null;
    /**
     * A categoria que o modelo **escolhido** traz consigo.
     *
     * Nula quando o formulário veio por herança, pela mesma razão do
     * destino: ficha herdada não reclassifica o chamado. Quem escolheu
     * "Trocar minha senha" escolheu junto a categoria dele — e é dessa
     * categoria que saem o roteamento, os acordos de SLA e a exigência
     * de aval.
     */
    categoriaDoModelo: string | null;
  }> {
    const form = formIdEscolhido
      ? await this.exigirModelo(organizationId, formIdEscolhido)
      : (await this.resolver(organizationId, categoryId)).form;
    const enviadas = respostas ?? {};

    if (!form) {
      // Sem formulário, resposta não tem onde encaixar: guardá-la seria
      // gravar JSON que nada valida e nada lê.
      if (Object.keys(enviadas).length > 0) {
        throw new BadRequestException(
          'Esta categoria não tem formulário: não há onde encaixar estas respostas.',
        );
      }
      return { formId: null, customFields: null, destinoDoModelo: null, categoriaDoModelo: null };
    }

    const schema = FormulariosService.schemaVisivel(form.schema, role);
    const erros = validarRespostas(schema, enviadas);

    if (erros.length > 0) throw FormulariosService.erroDeFormulario(erros);

    return {
      formId: form.id,
      customFields: Object.keys(enviadas).length > 0 ? enviadas : null,
      destinoDoModelo: formIdEscolhido
        ? { assigneeId: form.defaultAssignee?.id ?? null, teamId: form.defaultTeam?.id ?? null }
        : null,
      categoriaDoModelo: formIdEscolhido ? (form.category?.id ?? null) : null,
    };
  }

  /**
   * O modelo que a pessoa escolheu.
   *
   * `isModel` é exigido: ficha que existe só para herdar numa
   * subcategoria não é item de menu, e aceitá-la aqui deixaria alguém
   * responder a um formulário que ninguém ofereceu.
   */
  private async exigirModelo(organizationId: string, formId: string): Promise<FormularioView> {
    const modelo = await this.prisma.ticketForm.findFirst({
      where: { id: formId, organizationId, isModel: true },
      include: INCLUDE,
    });
    if (!modelo) throw new BadRequestException('Modelo de chamado não disponível.');
    return FormulariosService.paraView(modelo);
  }

  /**
   * O formulário como este perfil o vê.
   *
   * Quem não pode escrever nota interna também não vê campo interno: é
   * a mesma linha que separa o portal do atendimento.
   */
  private static schemaVisivel(schema: FormSchema, role: Role): FormSchema {
    if (can(role, 'chamado:nota-interna')) return schema;
    return { fields: schema.fields.filter((c) => !c.internal) };
  }

  private static erroDeFormulario(erros: ErroDeCampo[]): BadRequestException {
    return new BadRequestException({
      message: erros.map((e) => `${e.key}: ${e.mensagem}`),
      error: 'Bad Request',
      statusCode: 400,
    });
  }

  // -------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------

  async criar(
    usuario: UsuarioAutenticado,
    dto: EscreverFormularioDto,
  ): Promise<FormularioView> {
    const schema = FormulariosService.exigirSchema(dto.schema);
    await this.exigirCategoria(usuario, dto.categoryId);

    const formulario = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await FormulariosService.tirarOPadrao(tx, usuario.organizationId);

      try {
        return await tx.ticketForm.create({
          data: {
            organizationId: usuario.organizationId,
            name: dto.name,
            schema: schema as unknown as Prisma.InputJsonValue,
            categoryId: dto.categoryId ?? null,
            isDefault: dto.isDefault ?? false,
            isModel: dto.isModel ?? false,
            isPublic: dto.isPublic ?? false,
            description: dto.description ?? null,
            position: dto.position ?? 0,
            defaultTeamId: dto.defaultTeamId ?? null,
            defaultAssigneeId: dto.defaultAssigneeId ?? null,
            acaoAutomatica: dto.acaoAutomatica ?? null,
          },
          include: INCLUDE,
        });
      } catch (erro) {
        throw FormulariosService.traduzirDuplicidade(erro, dto.name);
      }
    });

    await this.auditoria.registrar(usuario, {
      action: 'formulario.criado',
      entity: 'TicketForm',
      entityId: formulario.id,
      depois: { name: dto.name, campos: schema.fields.length },
    });

    return FormulariosService.paraView(formulario);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarFormularioDto,
  ): Promise<FormularioView> {
    const antes = await this.exigir(usuario, id);
    await this.exigirCategoria(usuario, dto.categoryId);

    const schema = dto.schema
      ? FormulariosService.exigirSchema(dto.schema)
      : (antes.schema as unknown as FormSchema);

    const formulario = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await FormulariosService.tirarOPadrao(tx, usuario.organizationId, id);

      try {
        return await tx.ticketForm.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name }),
            schema: schema as unknown as Prisma.InputJsonValue,
            ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
            ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
            ...(dto.isModel === undefined ? {} : { isModel: dto.isModel }),
            ...(dto.isPublic === undefined ? {} : { isPublic: dto.isPublic }),
            ...(dto.description === undefined ? {} : { description: dto.description }),
            ...(dto.position === undefined ? {} : { position: dto.position }),
            ...(dto.defaultTeamId === undefined ? {} : { defaultTeamId: dto.defaultTeamId }),
            ...(dto.defaultAssigneeId === undefined
              ? {}
              : { defaultAssigneeId: dto.defaultAssigneeId }),
            ...(dto.acaoAutomatica === undefined ? {} : { acaoAutomatica: dto.acaoAutomatica }),
          },
          include: INCLUDE,
        });
      } catch (erro) {
        throw FormulariosService.traduzirDuplicidade(erro, dto.name ?? antes.name);
      }
    });

    await this.auditoria.registrar(usuario, {
      action: 'formulario.editado',
      entity: 'TicketForm',
      entityId: id,
      antes: { campos: (antes.schema as unknown as FormSchema).fields.length },
      depois: { campos: schema.fields.length },
    });

    return FormulariosService.paraView(formulario);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const antes = await this.exigir(usuario, id);

    if (antes._count.tickets > 0) {
      // Apagar levaria junto o significado das respostas já gravadas:
      // `customFields` viraria um punhado de chaves sem rótulo.
      throw new ConflictException(
        `${antes._count.tickets} chamado(s) já responderam a este formulário. ` +
          'Desvincule-o da categoria em vez de apagá-lo.',
      );
    }

    await this.prisma.ticketForm.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'formulario.removido',
      entity: 'TicketForm',
      entityId: id,
      antes: { name: antes.name },
    });
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async exigir(usuario: UsuarioAutenticado, id: string): Promise<ComRelacoes> {
    const formulario = await this.prisma.ticketForm.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });

    if (!formulario) throw new NotFoundException('Formulário não encontrado.');
    return formulario;
  }

  private static exigirSchema(dto: SchemaDto): FormSchema {
    const schema: FormSchema = {
      fields: dto.fields.map((c) => ({
        key: c.key,
        label: c.label,
        type: c.type,
        required: c.required,
        ...(c.options ? { options: c.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
        ...(c.help ? { help: c.help } : {}),
        ...(c.internal ? { internal: true } : {}),
      })),
    };

    const erros = validarSchema(schema);
    if (erros.length > 0) throw FormulariosService.erroDeFormulario(erros);

    return schema;
  }

  /** Um padrão por organização: dois seriam um sorteio na hora de resolver. */
  private static async tirarOPadrao(
    tx: Prisma.TransactionClient,
    organizationId: string,
    exceto?: string,
  ): Promise<void> {
    await tx.ticketForm.updateMany({
      where: { organizationId, isDefault: true, ...(exceto ? { id: { not: exceto } } : {}) },
      data: { isDefault: false },
    });
  }

  private async exigirCategoria(
    usuario: UsuarioAutenticado,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (!categoryId) return;

    const existe = await this.prisma.category.count({
      where: { id: categoryId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Categoria não encontrada nesta organização.');
  }

  private static traduzirDuplicidade(erro: unknown, nome: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(`Já existe um formulário chamado "${nome}".`);
    }
    return erro;
  }

  private static paraView(f: ComRelacoes): FormularioView {
    return {
      id: f.id,
      name: f.name,
      isDefault: f.isDefault,
      category: f.category ? { id: f.category.id, name: f.category.name } : null,
      schema: f.schema as unknown as FormSchema,
      ticketCount: f._count.tickets,
      isModel: f.isModel,
      isPublic: f.isPublic,
      description: f.description,
      position: f.position,
      defaultTeam: f.defaultTeam ? { id: f.defaultTeam.id, name: f.defaultTeam.name } : null,
      defaultAssignee: f.defaultAssignee
        ? { id: f.defaultAssignee.id, name: f.defaultAssignee.name }
        : null,
      acaoAutomatica: f.acaoAutomatica,
    };
  }
}
