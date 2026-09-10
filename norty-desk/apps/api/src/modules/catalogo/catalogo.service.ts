import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type {
  CriarCategoriaDto,
  CriarTimeDto,
  CriarUsuarioDto,
  EditarCategoriaDto,
  EditarTimeDto,
  EditarUsuarioDto,
  FiltroUsuarioDto,
} from './dto';

/** Quantos níveis a árvore de categorias aceita. */
const PROFUNDIDADE_MAXIMA = 3;

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Categorias
  // ------------------------------------------------------------------

  /**
   * A árvore, em ordem, com o caminho completo montado.
   *
   * `Hardware > Impressora` é o que a fila mostra numa coluna só. Montar
   * aqui evita cada tela reconstruir o caminho por conta própria.
   */
  async categorias(usuario: UsuarioAutenticado, incluirInativas = false) {
    const todas = await this.prisma.category.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(incluirInativas ? {} : { isActive: true }),
      },
      include: { defaultTeam: true, defaultAgreements: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    const porId = new Map(todas.map((c) => [c.id, c]));

    const caminho = (id: string): string => {
      const nomes: string[] = [];
      let atual = porId.get(id);
      // Um ciclo em dado corrompido travaria a listagem inteira; o teto
      // de profundidade também serve de trava aqui.
      for (let i = 0; atual && i <= PROFUNDIDADE_MAXIMA; i += 1) {
        nomes.unshift(atual.name);
        atual = atual.parentId ? porId.get(atual.parentId) : undefined;
      }
      return nomes.join(' > ');
    };

    return todas
      .map((c) => ({
        id: c.id,
        name: caminho(c.id),
        ownName: c.name,
        parentId: c.parentId,
        isActive: c.isActive,
        defaultTeam: c.defaultTeam ? { id: c.defaultTeam.id, name: c.defaultTeam.name } : null,
        defaultUrgency: c.defaultUrgency,
        defaultAgreements: c.defaultAgreements,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  private async validarPai(organizationId: string, parentId: string | undefined) {
    if (!parentId) return;

    let atual = await this.prisma.category.findFirst({
      where: { id: parentId, organizationId },
    });
    if (!atual) throw new BadRequestException('Categoria pai não encontrada nesta organização.');

    let nivel = 1;
    while (atual?.parentId) {
      nivel += 1;
      if (nivel >= PROFUNDIDADE_MAXIMA) {
        throw new BadRequestException(
          `A árvore de categorias vai até ${PROFUNDIDADE_MAXIMA} níveis. ` +
            'Mais que isso vira um menu que ninguém percorre.',
        );
      }
      atual = await this.prisma.category.findUnique({ where: { id: atual.parentId } });
    }
  }

  private async validarAcordos(organizationId: string, ids: string[] | undefined) {
    if (!ids?.length) return;
    const encontrados = await this.prisma.agreement.count({
      where: { id: { in: ids }, organizationId },
    });
    if (encontrados !== ids.length) {
      throw new BadRequestException('Algum acordo não pertence a esta organização.');
    }
  }

  async criarCategoria(usuario: UsuarioAutenticado, dto: CriarCategoriaDto) {
    await this.validarPai(usuario.organizationId, dto.parentId);
    await this.validarAcordos(usuario.organizationId, dto.defaultAgreementIds);

    const irmaoComMesmoNome = await this.prisma.category.findFirst({
      where: {
        organizationId: usuario.organizationId,
        parentId: dto.parentId ?? null,
        name: dto.name,
      },
    });
    if (irmaoComMesmoNome) {
      throw new ConflictException('Já existe uma categoria com este nome no mesmo nível.');
    }

    const criada = await this.prisma.category.create({
      data: {
        organizationId: usuario.organizationId,
        name: dto.name,
        parentId: dto.parentId,
        defaultTeamId: dto.defaultTeamId,
        defaultUrgency: dto.defaultUrgency,
        ...(dto.defaultAgreementIds
          ? { defaultAgreements: { connect: dto.defaultAgreementIds.map((id) => ({ id })) } }
          : {}),
      },
    });

    return (await this.categorias(usuario, true)).find((c) => c.id === criada.id)!;
  }

  async editarCategoria(usuario: UsuarioAutenticado, id: string, dto: EditarCategoriaDto) {
    const categoria = await this.prisma.category.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!categoria) throw new NotFoundException('Categoria não encontrada.');

    if (dto.parentId === id) {
      throw new BadRequestException('Uma categoria não pode ser pai de si mesma.');
    }

    await this.validarPai(usuario.organizationId, dto.parentId);
    await this.validarAcordos(usuario.organizationId, dto.defaultAgreementIds);

    await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        parentId: dto.parentId,
        defaultTeamId: dto.defaultTeamId,
        defaultUrgency: dto.defaultUrgency,
        isActive: dto.isActive,
        ...(dto.defaultAgreementIds
          ? { defaultAgreements: { set: dto.defaultAgreementIds.map((x) => ({ id: x })) } }
          : {}),
      },
    });

    return (await this.categorias(usuario, true)).find((c) => c.id === id)!;
  }

  /**
   * Categoria não é excluída, é desativada.
   *
   * Chamado antigo aponta para ela, e relatório histórico precisa do
   * nome. Excluir quebraria os dois.
   */
  async desativarCategoria(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const categoria = await this.prisma.category.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!categoria) throw new NotFoundException('Categoria não encontrada.');

    await this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }

  // ------------------------------------------------------------------
  // Times
  // ------------------------------------------------------------------

  async times(usuario: UsuarioAutenticado) {
    const times = await this.prisma.team.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    return times.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      email: t.email,
      isActive: t.isActive,
      members: t.members.map((m) => ({ ...m.user, isManager: m.isManager })),
    }));
  }

  async criarTime(usuario: UsuarioAutenticado, dto: CriarTimeDto) {
    const existente = await this.prisma.team.findFirst({
      where: { organizationId: usuario.organizationId, name: dto.name },
    });
    if (existente) throw new ConflictException('Já existe um time com este nome.');

    await this.prisma.team.create({
      data: { organizationId: usuario.organizationId, ...dto },
    });

    return this.times(usuario);
  }

  async editarTime(usuario: UsuarioAutenticado, id: string, dto: EditarTimeDto) {
    const time = await this.prisma.team.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!time) throw new NotFoundException('Time não encontrado.');

    await this.prisma.team.update({ where: { id }, data: dto });
    return this.times(usuario);
  }

  async adicionarMembro(usuario: UsuarioAutenticado, timeId: string, userId: string, isManager = false) {
    const time = await this.prisma.team.findFirst({
      where: { id: timeId, organizationId: usuario.organizationId },
    });
    if (!time) throw new NotFoundException('Time não encontrado.');

    const vinculo = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: usuario.organizationId } },
    });
    if (!vinculo) throw new BadRequestException('Usuário sem vínculo com esta organização.');

    await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: timeId, userId } },
      create: { teamId: timeId, userId, isManager },
      update: { isManager },
    });

    return this.times(usuario);
  }

  async removerMembro(usuario: UsuarioAutenticado, timeId: string, userId: string) {
    const time = await this.prisma.team.findFirst({
      where: { id: timeId, organizationId: usuario.organizationId },
    });
    if (!time) throw new NotFoundException('Time não encontrado.');

    await this.prisma.teamMember.deleteMany({ where: { teamId: timeId, userId } });
    return this.times(usuario);
  }

  // ------------------------------------------------------------------
  // Pessoas
  // ------------------------------------------------------------------

  async usuarios(usuario: UsuarioAutenticado, filtro: FiltroUsuarioDto) {
    const vinculos = await this.prisma.membership.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.role ? { role: filtro.role } : {}),
        ...(filtro.q
          ? {
              user: {
                OR: [
                  { name: { contains: filtro.q, mode: 'insensitive' } },
                  { email: { contains: filtro.q, mode: 'insensitive' } },
                  { username: { contains: filtro.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
      take: Math.min(filtro.limit ?? 100, 200),
    });

    // O hash da senha nunca sai daqui: a projeção é explícita, não uma
    // exclusão que alguém esquece de repetir no próximo endpoint.
    return vinculos.map((v) => ({
      id: v.user.id,
      name: v.user.name,
      email: v.user.email,
      username: v.user.username,
      phone: v.user.phone,
      avatarUrl: v.user.avatarUrl,
      isActive: v.user.isActive,
      mustChangePassword: v.user.mustChangePassword,
      role: v.role,
    }));
  }

  /**
   * Cria a pessoa e devolve uma senha provisória.
   *
   * A senha aparece uma única vez, na resposta. Ninguém a guarda em
   * texto: o que fica no banco é o hash Argon2id, e a conta nasce com
   * troca obrigatória.
   */
  async criarUsuario(usuario: UsuarioAutenticado, dto: CriarUsuarioDto) {
    const email = dto.email.toLowerCase().trim();
    const provisoria = randomBytes(9).toString('base64url');

    const existente = await this.prisma.user.findUnique({ where: { email } });

    if (existente) {
      const jaVinculado = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: existente.id, organizationId: usuario.organizationId },
        },
      });
      if (jaVinculado) throw new ConflictException('Esta pessoa já está nesta organização.');

      // A pessoa já existe noutra organização: vincula sem tocar na
      // senha dela.
      await this.prisma.membership.create({
        data: {
          userId: existente.id,
          organizationId: usuario.organizationId,
          role: dto.role,
        },
      });
      return { id: existente.id, email, name: existente.name, role: dto.role, senhaProvisoria: null };
    }

    const username = dto.username ? dto.username.toLowerCase().trim() : null;
    if (username && (await this.prisma.user.findUnique({ where: { username } }))) {
      throw new ConflictException('Este nome de usuário já está em uso.');
    }

    const criado = await this.prisma.user.create({
      data: {
        email,
        username,
        name: dto.name,
        phone: dto.phone,
        passwordHash: await AuthService.hashDeSenha(provisoria),
        mustChangePassword: true,
        memberships: {
          create: { organizationId: usuario.organizationId, role: dto.role },
        },
      },
    });

    return {
      id: criado.id,
      email: criado.email,
      username: criado.username,
      name: criado.name,
      role: dto.role,
      senhaProvisoria: provisoria,
    };
  }

  async editarUsuario(usuario: UsuarioAutenticado, id: string, dto: EditarUsuarioDto) {
    const vinculo = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: id, organizationId: usuario.organizationId } },
    });
    if (!vinculo) throw new NotFoundException('Pessoa não encontrada nesta organização.');

    // Um administrador rebaixando a si mesmo perderia o acesso à tela em
    // que está — e, se for o único, a organização fica sem quem
    // administre.
    if (id === usuario.userId && dto.role && dto.role !== vinculo.role) {
      throw new BadRequestException('Você não pode alterar o seu próprio perfil.');
    }

    if (dto.role || dto.isActive === false) {
      await this.exigirOutroAdministrador(usuario.organizationId, id);
    }

    const username =
      dto.username === undefined ? undefined : dto.username ? dto.username.toLowerCase().trim() : null;
    if (username) {
      const dono = await this.prisma.user.findUnique({ where: { username } });
      if (dono && dono.id !== id) throw new ConflictException('Este nome de usuário já está em uso.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { name: dto.name, phone: dto.phone, isActive: dto.isActive, username },
      }),
      ...(dto.role
        ? [
            this.prisma.membership.update({
              where: {
                userId_organizationId: { userId: id, organizationId: usuario.organizationId },
              },
              data: { role: dto.role },
            }),
          ]
        : []),
    ]);

    return (await this.usuarios(usuario, {})).find((u) => u.id === id)!;
  }

  // ------------------------------------------------------------------
  // Chaves de aplicação
  // ------------------------------------------------------------------

  async chaves(usuario: UsuarioAutenticado) {
    const chaves = await this.prisma.apiKey.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    // O hash nunca sai: a projeção é explícita, como na listagem de
    // pessoas.
    return chaves.map((c) => ({
      id: c.id,
      name: c.name,
      scopes: c.scopes,
      lastUsedAt: c.lastUsedAt,
      revokedAt: c.revokedAt,
      createdAt: c.createdAt,
    }));
  }

  /**
   * Cria a chave e devolve o valor cru **uma única vez**.
   *
   * O que fica no banco é o SHA-256. Se quem criou perder o valor, o
   * caminho é revogar e criar outra — não há como recuperá-lo, e é
   * assim que tem de ser.
   */
  async criarChave(usuario: UsuarioAutenticado, dados: { name: string; scopes: string[] }) {
    const existente = await this.prisma.apiKey.findFirst({
      where: { organizationId: usuario.organizationId, name: dados.name },
    });
    if (existente) throw new ConflictException('Já existe uma chave com este nome.');

    const permitidos = new Set<string>([
      'chamado:criar',
      'chamado:ler:proprios',
      'chamado:responder',
      'anexo:enviar',
    ]);

    const invalidos = dados.scopes.filter((e) => !permitidos.has(e));
    if (invalidos.length) {
      throw new BadRequestException(
        `Escopo não permitido para chave de aplicação: ${invalidos.join(', ')}. ` +
          'Chave é de integração, não de administração.',
      );
    }

    const cru = `nd_${randomBytes(24).toString('base64url')}`;

    const chave = await this.prisma.apiKey.create({
      data: {
        organizationId: usuario.organizationId,
        name: dados.name,
        keyHash: createHash('sha256').update(cru).digest('hex'),
        scopes: dados.scopes,
      },
    });

    return { id: chave.id, name: chave.name, scopes: chave.scopes, chave: cru };
  }

  async revogarChave(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const chave = await this.prisma.apiKey.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!chave) throw new NotFoundException('Chave não encontrada.');

    // Revogar, não excluir: o histórico de qual chave abriu qual
    // chamado continua fazendo sentido depois.
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Impede a organização ficar sem administrador ativo. */
  private async exigirOutroAdministrador(organizationId: string, exceto: string): Promise<void> {
    const outros = await this.prisma.membership.count({
      where: {
        organizationId,
        role: 'ADMINISTRADOR',
        userId: { not: exceto },
        user: { isActive: true },
      },
    });

    const alvo = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: exceto, organizationId } },
    });

    if (alvo?.role === 'ADMINISTRADOR' && outros === 0) {
      throw new BadRequestException(
        'Esta é a única pessoa administradora ativa. Promova outra antes.',
      );
    }
  }
}
