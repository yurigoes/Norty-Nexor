import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ROLE_PERMISSIONS, type LoginResponse, type MeResponse } from '@norty-desk/shared';
import { Prisma, type AuthSource } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { normalizarUsername } from '../../common/usuario';
import { DiretorioService } from '../diretorio/diretorio.service';
import { ErroDeDiretorio, type PessoaDoDiretorio, type ResultadoLdap } from '../diretorio/ldap';
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

type UsuarioComVinculos = Prisma.UserGetPayload<{
  include: { memberships: { include: { organization: true } } };
}>;

/**
 * Diretório fora do ar não é senha errada. Responder "usuário ou senha
 * inválidos" aqui faria uma queda do AD parecer, para a empresa inteira,
 * que todo mundo esqueceu a senha — e o suporte iria resetar senhas.
 */
const MSG_DIRETORIO_FORA =
  'Não foi possível falar com o diretório (AD) da empresa. Tente de novo em instantes.';

export type ParDeTokens = {
  accessToken: string;
  /** Valor cru do refresh. Só existe aqui e no cookie — nunca no banco. */
  refreshToken: string;
  refreshExpiraEm: Date;
};

@Injectable()
export class AuthService {
  private readonly log = new Logger('Login');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly diretorio: DiretorioService,
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
  async login(identificador: string, senha: string, organizacao?: string): Promise<LoginResponse> {
    const chave = identificador.toLowerCase().trim();
    const slug = organizacao?.toLowerCase().trim() || undefined;

    // Com "@" o login é o e-mail, que é global. Sem "@" é o nome de
    // usuário, que só é único dentro da organização (decisão do Yuri) —
    // sem ela não há como saber de quem se trata. Pedir a empresa não
    // revela nada: é sobre a forma do pedido, não sobre a conta.
    if (chave && !chave.includes('@') && !slug) {
      throw new BadRequestException('Informe a empresa para entrar com nome de usuário.');
    }

    const alvo = !chave
      ? null
      : chave.includes('@')
        ? await this.prisma.user.findUnique({ where: { email: chave }, select: { id: true } })
        : await this.prisma.membership
            .findFirst({ where: { username: chave, organization: { slug } }, select: { userId: true } })
            .then((v) => (v ? { id: v.userId } : null));

    let usuario = alvo ? await this.carregar(alvo.id) : null;

    if (usuario?.authSourceId) {
      // Conta de diretório: a senha é sempre a do AD. A guardada aqui é
      // aleatória e não abre esta conta.
      usuario = await this.entrarPeloDiretorio(usuario, senha);
    } else if (usuario) {
      if (!(await argon2.verify(usuario.passwordHash, senha).catch(() => false))) usuario = null;
    } else {
      // Ninguém com esse login aqui. Com usuário + empresa, pode ser o
      // primeiro acesso de alguém do AD dela: o GLPI cria na hora.
      usuario =
        chave && !chave.includes('@') && slug
          ? await this.provisionarPeloDiretorio(chave, senha, slug)
          : null;
      // Sem conta para conferir, o relógio ainda paga um verify.
      if (!usuario) await argon2.verify(HASH_FANTASMA, senha).catch(() => false);
    }

    if (!usuario || !usuario.isActive || usuario.memberships.length === 0) {
      throw new UnauthorizedException('Usuário ou senha inválidos.');
    }

    // A organização informada vem primeiro: é para ela que o controller
    // emite o token.
    const vinculos = [...usuario.memberships].sort(
      (a, b) => Number(b.organization.slug === slug) - Number(a.organization.slug === slug),
    );

    return {
      accessToken: '',
      user: {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        username: vinculos[0]?.username ?? null,
        mustChangePassword: usuario.mustChangePassword,
      },
      organizations: vinculos.map((v) => ({
        id: v.organization.id,
        slug: v.organization.slug,
        name: v.organization.name,
        role: v.role,
      })),
    };
  }

  private carregar(id: string): Promise<UsuarioComVinculos | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Quem já veio do diretório entra sempre por ele — pela fonte que o
   * criou, com o login do vínculo na organização dela (é o que o AD
   * conhece), mesmo que tenha digitado o e-mail.
   */
  private async entrarPeloDiretorio(
    usuario: UsuarioComVinculos,
    senha: string,
  ): Promise<UsuarioComVinculos | null> {
    const fonte = await this.prisma.authSource.findUnique({ where: { id: usuario.authSourceId! } });
    if (!fonte?.isActive) return null;

    const login = usuario.memberships.find((v) => v.organizationId === fonte.organizationId)?.username;
    if (!login) return null;

    let resultado: ResultadoLdap;
    try {
      resultado = await this.diretorio.autenticar(fonte, login, senha);
    } catch (e) {
      if (!(e instanceof ErroDeDiretorio)) throw e;
      this.log.warn(`Fonte "${fonte.name}": ${e.message}`);
      throw new ServiceUnavailableException(MSG_DIRETORIO_FORA);
    }
    if (!resultado.ok) return null;

    // O mesmo login com outro objectGUID é outra conta no AD — alguém que
    // herdou o login de quem saiu. Não herda também o histórico no Desk.
    const { externalId } = resultado.pessoa;
    if (usuario.externalId && externalId && usuario.externalId !== externalId) {
      this.log.warn(
        `"${login}" na fonte "${fonte.name}": o ${fonte.syncField} mudou — outra conta no AD com o mesmo login. Recusado.`,
      );
      return null;
    }

    await this.sincronizar(usuario.id, resultado.pessoa);
    return this.carregar(usuario.id);
  }

  /**
   * O primeiro acesso de alguém do diretório: tenta as fontes ativas da
   * empresa, na ordem configurada, como o GLPI. Achou a pessoa e a senha
   * não bateu? Para ali — a mesma senha errada não vira certa noutro AD.
   */
  private async provisionarPeloDiretorio(
    login: string,
    senha: string,
    slug: string,
  ): Promise<UsuarioComVinculos | null> {
    const organizacao = await this.prisma.organization.findFirst({ where: { slug }, select: { id: true } });
    if (!organizacao) return null;

    let queda = false;
    for (const fonte of await this.diretorio.fontesAtivas(organizacao.id)) {
      let resultado: ResultadoLdap;
      try {
        resultado = await this.diretorio.autenticar(fonte, login, senha);
      } catch (e) {
        if (!(e instanceof ErroDeDiretorio)) throw e;
        this.log.warn(`Fonte "${fonte.name}": ${e.message}`);
        queda = true;
        continue;
      }
      if (resultado.ok) return this.vincular(fonte, organizacao.id, resultado.pessoa);
      if (resultado.motivo === 'senha') return null;
    }

    // Só é "fora do ar" se nenhuma fonte que respondeu conhecia a pessoa.
    if (queda) throw new ServiceUnavailableException(MSG_DIRETORIO_FORA);
    return null;
  }

  private async vincular(
    fonte: AuthSource,
    organizationId: string,
    pessoa: PessoaDoDiretorio,
  ): Promise<UsuarioComVinculos | null> {
    const username = pessoa.login.toLowerCase().trim();

    try {
      // Já entrou antes e o login mudou no AD — o objectGUID não muda. O
      // vínculo acompanha o login novo.
      const existente = pessoa.externalId
        ? await this.prisma.user.findUnique({
            where: { authSourceId_externalId: { authSourceId: fonte.id, externalId: pessoa.externalId } },
            select: { id: true },
          })
        : null;

      if (existente) {
        await this.prisma.membership.upsert({
          where: { userId_organizationId: { userId: existente.id, organizationId } },
          create: { userId: existente.id, organizationId, role: fonte.defaultRole, username },
          update: { username },
        });
        await this.sincronizar(existente.id, pessoa);
        return this.carregar(existente.id);
      }

      if (!fonte.autoCreate) {
        this.log.log(`"${username}" autenticou na fonte "${fonte.name}", que não cria contas sozinha.`);
        return null;
      }

      // E-mail que já é de outra conta não vincula: seria entregar aquela
      // conta a quem administra o AD. A pessoa nasce sem e-mail.
      const emailLivre =
        pessoa.email &&
        !(await this.prisma.user.findUnique({ where: { email: pessoa.email }, select: { id: true } }));
      if (pessoa.email && !emailLivre) {
        this.log.warn(`"${username}" (fonte "${fonte.name}"): o e-mail do AD já é de outra conta; criada sem e-mail.`);
      }

      const criado = await this.prisma.user.create({
        data: {
          name: pessoa.nome ?? pessoa.login,
          email: emailLivre ? pessoa.email : null,
          phone: pessoa.telefone,
          // Ninguém conhece esta senha: a conta só abre pelo diretório.
          passwordHash: await AuthService.hashDeSenha(randomBytes(32).toString('base64url')),
          mustChangePassword: false,
          authSourceId: fonte.id,
          externalId: pessoa.externalId,
          memberships: { create: { organizationId, role: fonte.defaultRole, username } },
        },
        select: { id: true },
      });
      this.log.log(`"${username}" criado(a) pela fonte "${fonte.name}" como ${fonte.defaultRole}.`);
      return this.carregar(criado.id);
    } catch (e) {
      // O login já é de uma conta local desta empresa: não se funde conta
      // local com conta de diretório por coincidência de nome.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.log.warn(`"${username}" (fonte "${fonte.name}"): o login já é de outra conta nesta organização. Recusado.`);
        return null;
      }
      throw e;
    }
  }

  /** A cada login, nome, e-mail e telefone voltam a ser os do diretório — como no GLPI. */
  private async sincronizar(userId: string, pessoa: PessoaDoDiretorio): Promise<void> {
    const emailLivre =
      pessoa.email &&
      !(await this.prisma.user.findFirst({
        where: { email: pessoa.email, NOT: { id: userId } },
        select: { id: true },
      }));

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(pessoa.nome ? { name: pessoa.nome } : {}),
          ...(emailLivre ? { email: pessoa.email } : {}),
          ...(pessoa.telefone ? { phone: pessoa.telefone } : {}),
          ...(pessoa.externalId ? { externalId: pessoa.externalId } : {}),
        },
      });
    } catch (e) {
      // Sincronizar é conveniência: um conflito aqui não impede a entrada.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      this.log.warn(`Sincronização de ${userId} com o diretório recusada por unicidade; login segue.`);
    }
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
      include: {
        user: { include: { authSource: { select: { name: true } } } },
        organization: true,
      },
    });

    return {
      user: {
        id: vinculo.user.id,
        name: vinculo.user.name,
        email: vinculo.user.email,
        username: vinculo.username,
        authSourceName: vinculo.user.authSource?.name ?? null,
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
    const vinculo = await this.prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: { userId: usuario.userId, organizationId: usuario.organizationId },
      },
      include: { user: true },
    });
    const atual = vinculo.user;

    const email =
      dto.email === undefined ? undefined : dto.email ? dto.email.toLowerCase().trim() : null;
    const username =
      dto.username === undefined ? undefined : dto.username ? normalizarUsername(dto.username) : null;

    const mudaEmail = email !== undefined && email !== atual.email;
    const mudaUsername = username !== undefined && username !== vinculo.username;

    if ((mudaEmail || mudaUsername) && atual.authSourceId) {
      throw new BadRequestException('Conta do diretório: o e-mail e o usuário vêm do AD.');
    }
    const emailFinal = email === undefined ? atual.email : email;
    const usernameFinal = username === undefined ? vinculo.username : username;
    if (!emailFinal && !usernameFinal) {
      throw new BadRequestException('Mantenha ao menos um jeito de entrar: e-mail ou nome de usuário.');
    }
    if (mudaEmail || mudaUsername) {
      const confere = dto.senhaAtual ? await argon2.verify(atual.passwordHash, dto.senhaAtual) : false;
      if (!confere) {
        throw new BadRequestException('Confirme com a sua senha atual para trocar o e-mail ou o usuário.');
      }
    }
    if (mudaEmail && email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException('Este e-mail já está em uso.');
    }
    if (
      mudaUsername &&
      username &&
      (await this.prisma.membership.findFirst({
        where: { organizationId: usuario.organizationId, username, NOT: { userId: usuario.userId } },
      }))
    ) {
      throw new ConflictException('Este nome de usuário já está em uso nesta organização.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: usuario.userId },
        data: {
          name: dto.name?.trim(),
          phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
          ...(mudaEmail ? { email } : {}),
        },
      }),
      ...(mudaUsername
        ? [this.prisma.membership.update({ where: { id: vinculo.id }, data: { username } })]
        : []),
    ]);

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

    if (usuario.authSourceId) {
      throw new BadRequestException('A senha desta conta é a do diretório (AD) — troque por lá.');
    }

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
