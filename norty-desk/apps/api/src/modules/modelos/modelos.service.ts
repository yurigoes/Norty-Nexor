import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type ModeloView, marcadoresInvalidos } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { BuscarModelosDto, EditarModeloDto, EscreverModeloDto } from './dto';

const INCLUDE = { category: true } satisfies Prisma.TemplateInclude;

type ComRelacoes = Prisma.TemplateGetPayload<{ include: typeof INCLUDE }>;

/**
 * Modelos de resposta, solução e tarefa.
 *
 * O GLPI tem três tabelas quase idênticas, cada uma com sua tela.
 * Aqui é um modelo com discriminador — mesma tela, mesma busca, e o
 * `kind` diz onde ele aparece.
 *
 * O texto é preenchido **no aplicativo**, no momento em que o agente o
 * escolhe: ele ainda vai editar antes de enviar. Preencher no servidor
 * devolveria um texto pronto que o agente edita e reenvia inteiro — o
 * mesmo resultado, com uma ida a mais e uma chance a mais de o texto
 * chegar diferente do que ele viu.
 */
@Injectable()
export class ModelosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(usuario: UsuarioAutenticado, filtro: BuscarModelosDto): Promise<ModeloView[]> {
    const termo = filtro.q?.trim();

    const modelos = await this.prisma.template.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.kind ? { kind: filtro.kind } : {}),
        ...(filtro.incluirInativos ? {} : { isActive: true }),
        // A categoria do chamado traz os modelos dela **e** os que valem
        // para qualquer categoria. Trazer só os dela esconderia o "Bom
        // dia, já estamos olhando" de todo mundo.
        ...(filtro.categoryId
          ? { OR: [{ categoryId: filtro.categoryId }, { categoryId: null }] }
          : {}),
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                { body: { contains: termo, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: INCLUDE,
      // O mais usado primeiro: é o que o atendimento procura, e a ordem
      // alfabética faria "Agradecimento" ganhar de "Já estamos olhando"
      // todo dia.
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      take: 200,
    });

    return modelos.map((m) => ModelosService.paraView(m));
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverModeloDto): Promise<ModeloView> {
    ModelosService.exigirMarcadoresValidos(dto.body);
    await this.exigirCategoria(usuario, dto.categoryId);

    if (dto.isInternal && dto.kind !== 'RESPOSTA') {
      throw new BadRequestException(
        'Nota interna é conceito de resposta: modelo de solução ou de tarefa não tem visibilidade.',
      );
    }

    let modelo: ComRelacoes;
    try {
      modelo = await this.prisma.template.create({
        data: {
          organizationId: usuario.organizationId,
          kind: dto.kind,
          name: dto.name,
          body: dto.body,
          categoryId: dto.categoryId ?? null,
          isInternal: dto.isInternal ?? false,
          isActive: dto.isActive ?? true,
        },
        include: INCLUDE,
      });
    } catch (erro) {
      throw ModelosService.traduzirDuplicidade(erro, dto.name);
    }

    await this.auditoria.registrar(usuario, {
      action: 'modelo.criado',
      entity: 'Template',
      entityId: modelo.id,
      depois: { kind: dto.kind, name: dto.name },
    });

    return ModelosService.paraView(modelo);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarModeloDto,
  ): Promise<ModeloView> {
    const antes = await this.exigir(usuario, id);
    if (dto.body !== undefined) ModelosService.exigirMarcadoresValidos(dto.body);
    await this.exigirCategoria(usuario, dto.categoryId);

    if (dto.isInternal && antes.kind !== 'RESPOSTA') {
      throw new BadRequestException(
        'Nota interna é conceito de resposta: modelo de solução ou de tarefa não tem visibilidade.',
      );
    }

    let modelo: ComRelacoes;
    try {
      modelo = await this.prisma.template.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.body === undefined ? {} : { body: dto.body }),
          ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
          ...(dto.isInternal === undefined ? {} : { isInternal: dto.isInternal }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        include: INCLUDE,
      });
    } catch (erro) {
      throw ModelosService.traduzirDuplicidade(erro, dto.name ?? antes.name);
    }

    await this.auditoria.registrar(usuario, {
      action: 'modelo.editado',
      entity: 'Template',
      entityId: id,
      antes: { name: antes.name, isActive: antes.isActive },
      depois: { name: modelo.name, isActive: modelo.isActive },
    });

    return ModelosService.paraView(modelo);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const antes = await this.exigir(usuario, id);
    await this.prisma.template.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'modelo.removido',
      entity: 'Template',
      entityId: id,
      antes: { kind: antes.kind, name: antes.name },
    });
  }

  /**
   * Registra que o modelo foi usado.
   *
   * É o que faz a lista se ordenar sozinha pelo que serve. Não lança:
   * falhar a contagem não pode impedir a resposta de sair — o modelo já
   * está no editor de quem escreve.
   */
  async registrarUso(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.prisma.template
      .updateMany({
        where: { id, organizationId: usuario.organizationId },
        data: { usageCount: { increment: 1 } },
      })
      .catch(() => undefined);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async exigir(usuario: UsuarioAutenticado, id: string): Promise<ComRelacoes> {
    const modelo = await this.prisma.template.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });

    if (!modelo) throw new NotFoundException('Modelo não encontrado.');
    return modelo;
  }

  /**
   * Marcador inventado é recusado ao salvar.
   *
   * Errar na hora de salvar é barato; errar na resposta ao cliente, que
   * sai com `{{requerente.apelido}}` no meio da frase, não é.
   */
  private static exigirMarcadoresValidos(body: string): void {
    const invalidos = marcadoresInvalidos(body);
    if (invalidos.length > 0) {
      throw new BadRequestException(
        `Estes marcadores não existem: ${invalidos.map((m) => `{{${m}}}`).join(', ')}.`,
      );
    }
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
      return new ConflictException(`Já existe um modelo deste tipo chamado "${nome}".`);
    }
    return erro;
  }

  private static paraView(m: ComRelacoes): ModeloView {
    return {
      id: m.id,
      kind: m.kind,
      name: m.name,
      body: m.body,
      category: m.category ? { id: m.category.id, name: m.category.name } : null,
      isInternal: m.isInternal,
      isActive: m.isActive,
      usageCount: m.usageCount,
    };
  }
}
