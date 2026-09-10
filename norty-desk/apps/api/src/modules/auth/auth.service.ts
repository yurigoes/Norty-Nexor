import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ROLE_PERMISSIONS, type LoginResponse, type MeResponse } from '@norty-desk/shared';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { normalizarUsername } from '../../common/usuario';
import type { AtualizarPerfilDto } from './dto';

/**
 * Hash de uma senha que não existe.
 *
 * Quando o e-mail não está cadastrado, ainda assim verificamos uma senha
 * contra este hash. Sem isso o tempo de resposta denuncia quais e-mails
 * existem — e a mensagem idêntica de erro não serviria para nada.
 */
const HASH_FANTASMA =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXRoaW5nc2FsdHk$0000000000000000000000000000000000000000000';

const OPCOES_ARGON = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 } as const;

export type ParDeTokens = {
  accessToken: string;
  /** Valor cru do refresh. Só existe aqui e no cookie — nunca no banco. */
  refreshToken: string;
  refreshExpiraEm: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static hashDeRefresh(cru: string): string {
    return createHash('sha256').update(cru).digest('hex');
  }

  static async hashDeSenha(senha: string): Promise<string> {
    return argon2.hash(senha, OPCOES_ARGON);
  }

  /**
   * Login.
   *
   * A mensagem é idêntica para login inexistente e senha errada, e o
   * caminho do login inexistente também paga o custo de um `verify` —
   * senão o relógio conta o que a mensagem esconde.
   */
  async login(identificador: string, senha: string): Promise<LoginResponse> {
    // E-mail tem "@" e nome de usuário não pode ter (a validação recusa),
    // então o "@" escolhe o campo sem ambiguidade.
    const chave = identificador.toLowerCase().trim();
    const usuario = chave
      ? await this.prisma.user.findUnique({
          where: chave.includes('@') ? { email: chave } : { username: chave },
          include: {
            memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } },
          },
        })
      : null;

    const hash = usuario?.passwordHash ?? HASH_FANTASMA;
    let confere = false;
    try {
      confere = await argon2.verify(hash, senha);
    } catch {
      confere = false;
    }

    if (!usuario || !usuario.isActive || !confere) {
      throw new UnauthorizedException('Usuário ou senha inválidos.');
    }

    if (usuario.memberships.length === 0) {
      throw new UnauthorizedException('Usuário ou senha inválidos.');
    }

    return {
      accessToken: '',
      user: {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        username: usuario.username,
        mustChangePassword: usuario.mustChangePassword,
      },
      organizations: usuario.memberships.map((v) => ({
        id: v.organization.id,
        slug: v.organization.slug,
        name: v.organization.name,
        role: v.role,
      })),
    };
  }

  /** Emite o par de tokens para um vínculo já validado. */
  async emitirTokens(userId: string, organizationId: string): Promise<ParDeTokens> {
    const vinculo = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    if (!vinculo) throw new UnauthorizedException('Sem vínculo com esta organização.');

    const accessToken = await this.jwt.signAsync({ sub: userId, org: organizationId });

    const cru = randomBytes(48).toString('base64url');
    const dias = Number(process.env.JWT_REFRESH_TTL?.replace(/\D/g, '') || 7);
    const refreshExpiraEm = new Date(Date.now() + dias * 24 * 3600 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: AuthService.hashDeRefresh(cru),
        expiresAt: refreshExpiraEm,
      },
    });

    return { accessToken, refreshToken: cru, refreshExpiraEm };
  }

  /**
   * Rotação do refresh: o token usado é revogado e um novo é emitido.
   *
   * Se chegar um token **já revogado**, é reúso — ou o cookie vazou, ou
   * alguém está replicando. Nesse caso revogamos a família inteira do
   * usuário e obrigamos login. Perder a sessão é barato; manter uma
   * sessão sequestrada aberta não é.
   */
  async rotacionar(cru: string, organizationId: string): Promise<ParDeTokens> {
    const hash = AuthService.hashDeRefresh(cru);
    const guardado = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!guardado) throw new UnauthorizedException('Sessão inválida.');

    if (guardado.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: guardado.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão inválida.');
    }

    if (guardado.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão expirada.');
    }

    await this.prisma.refreshToken.update({
      where: { id: guardado.id },
      data: { revokedAt: new Date() },
    });

    return this.emitirTokens(guardado.userId, organizationId);
  }

  /**
   * A organização em que renovar quando o cliente não diz qual.
   *
   * O refresh não carrega JWT, então não há organização no pedido. Cai
   * no vínculo mais antigo do usuário — o mesmo critério que o login
   * usa para escolher a organização inicial, para as duas portas
   * concordarem.
   */
  async organizacaoMaisRecente(cru: string): Promise<string> {
    const guardado = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: AuthService.hashDeRefresh(cru) },
      select: { userId: true },
    });

    if (!guardado) throw new UnauthorizedException('Sessão inválida.');

    const vinculo = await this.prisma.membership.findFirst({
      where: { userId: guardado.userId },
      orderBy: { createdAt: 'asc' },
      select: { organizationId: true },
    });

    if (!vinculo) throw new UnauthorizedException('Sessão inválida.');
    return vinculo.organizationId;
  }

  async encerrar(cru: string | undefined): Promise<void> {
    if (!cru) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: AuthService.hashDeRefresh(cru), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * O `/me` devolve as permissões já resolvidas: o aplicativo não
   * recalcula a matriz, e as duas pontas não podem divergir.
   */
  async me(usuario: UsuarioAutenticado): Promise<MeResponse> {
    const vinculo = await this.prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: usuario.userId,
          organizationId: usuario.organizationId,
        },
      },
      include: { user: true, organization: true },
    });

    return {
      user: {
        id: vinculo.user.id,
        name: vinculo.user.name,
        email: vinculo.user.email,
        username: vinculo.user.username,
        phone: vinculo.user.phone,
        mustChangePassword: vinculo.user.mustChangePassword,
        avatarUrl: vinculo.user.avatarUrl ?? undefined,
      },
      organization: {
        id: vinculo.organization.id,
        slug: vinculo.organization.slug,
        name: vinculo.organization.name,
        role: vinculo.role,
      },
      role: vinculo.role,
      permissions: [...ROLE_PERMISSIONS[vinculo.role]],
      teamIds: usuario.teamIds,
    };
  }

  /**
   * A pessoa editando os próprios dados.
   *
   * E-mail e nome de usuário são o login: trocá-los pede a senha atual,
   * pelo mesmo motivo da troca de senha — o computador destravado de um
   * colega não pode virar a conta dele. A recusa é 400, não 401: um 401
   * aqui faria o aplicativo tratar senha errada como sessão expirada.
   */
  async atualizarPerfil(usuario: UsuarioAutenticado, dto: AtualizarPerfilDto): Promise<MeResponse> {
    const atual = await this.prisma.user.findUniqueOrThrow({ where: { id: usuario.userId } });

    const email = dto.email === undefined ? undefined : dto.email.toLowerCase().trim();
    const username =
      dto.username === undefined ? undefined : dto.username ? normalizarUsername(dto.username) : null;

    const mudaEmail = email !== undefined && email !== atual.email;
    const mudaUsername = username !== undefined && username !== atual.username;

    if (mudaEmail || mudaUsername) {
      const confere = dto.senhaAtual ? await argon2.verify(atual.passwordHash, dto.senhaAtual) : false;
      if (!confere) {
        throw new BadRequestException('Confirme com a sua senha atual para trocar o e-mail ou o usuário.');
      }
    }
    if (mudaEmail && email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException('Este e-mail já está em uso.');
    }
    if (mudaUsername && username && (await this.prisma.user.findUnique({ where: { username } }))) {
      throw new ConflictException('Este nome de usuário já está em uso.');
    }

    await this.prisma.user.update({
      where: { id: usuario.userId },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
        ...(mudaEmail ? { email } : {}),
        ...(mudaUsername ? { username } : {}),
      },
    });

    return this.me(usuario);
  }

  /**
   * Troca de senha. Exige a senha atual mesmo quando a troca é
   * obrigatória: quem senta no computador destravado de um colega não
   * pode assumir a conta dele.
   */
  async trocarSenha(userId: string, atual: string, nova: string): Promise<void> {
    if (nova.length < 8) {
      throw new BadRequestException('A nova senha precisa de ao menos 8 caracteres.');
    }

    const usuario = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // 400 e não 401: o aplicativo trata 401 como sessão vencida — renova,
    // repete e, no segundo 401, desloga. Senha atual errada não é sessão
    // vencida, e deslogar aqui jogava a pessoa na tela de login.
    if (!(await argon2.verify(usuario.passwordHash, atual))) {
      throw new BadRequestException('Senha atual incorreta.');
    }

    if (await argon2.verify(usuario.passwordHash, nova)) {
      throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await AuthService.hashDeSenha(nova),
          mustChangePassword: false,
        },
      }),
      // Trocar a senha derruba as outras sessões: é o que o usuário
      // espera quando troca a senha porque desconfia de algo.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
