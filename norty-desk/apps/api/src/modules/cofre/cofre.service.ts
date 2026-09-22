import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ConcessaoView,
  LeituraDoSegredoView,
  SegredoRevelado,
  SegredoView,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { cifrarSenha, cofreConfigurado, decifrarSenha, novoSal } from './cofre.cripto';
import type { CompartilharDto, EscreverSegredoDto } from './dto';

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  asset: { select: { id: true, name: true } },
} as const;

type ComRelacoes = Prisma.SecretGetPayload<{ include: typeof INCLUDE }>;

/**
 * O cofre de senhas.
 *
 * O `docs/13`, seção 8, dizia que o Desk **não** é um cofre: os campos
 * de acesso remoto do equipamento guardam a senha do AnyDesk e nada
 * além. Isto aqui muda essa frase, e muda porque as três coisas que
 * faltavam passaram a existir — não porque o nome ficou bonito:
 *
 * 1. **Chave própria e derivada por segredo** (`cofre.cripto.ts`).
 * 2. **Concessão com validade**, que vence sozinha e pode ser revogada.
 * 3. **Registro de cada leitura**, visível para o dono do segredo.
 *
 * ## Quem abre o quê
 *
 * O dono, e quem ele deixou. Mais ninguém — e isso inclui o
 * administrador, que pode ver que o segredo **existe** e não pode
 * lê-lo.
 *
 * O administrador pode **assumir** um segredo, o que é outra coisa: um
 * ato registrado na trilha e visível na tela do dono anterior, que
 * existe para o dia em que alguém sai da empresa com o cofre dele. Vale
 * dizer sem rodeio o que essa escolha compra e o que não compra: ela
 * não torna a leitura impossível para um administrador determinado —
 * torna-a **impossível de fazer em silêncio**. Accountability, não
 * impossibilidade. A alternativa em que ninguém recupera nada tranca a
 * empresa para fora do que é dela no primeiro pedido de demissão.
 */
@Injectable()
export class CofreService {
  private readonly logger = new Logger(CofreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  disponivel(): boolean {
    return cofreConfigurado();
  }

  private exigirCofre(): void {
    if (!cofreConfigurado()) {
      throw new BadRequestException(
        'O cofre não está configurado nesta instalação (VAULT_SECRET_KEY).',
      );
    }
  }

  // -------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------

  /**
   * Os segredos que esta pessoa pode abrir: os dela e os que recebeu.
   *
   * A cerca é a consulta, e não um filtro depois. Carregar o cofre da
   * organização para descartar o que não é meu significaria ter tido a
   * senha de todo mundo em memória — e um `console.log` no lugar errado
   * a mandaria para o log.
   */
  async meus(usuario: UsuarioAutenticado): Promise<SegredoView[]> {
    const agora = new Date();

    const linhas = await this.prisma.secret.findMany({
      where: {
        organizationId: usuario.organizationId,
        OR: [
          { ownerId: usuario.userId },
          {
            grants: {
              some: {
                userId: usuario.userId,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }],
              },
            },
          },
        ],
      },
      include: {
        ...INCLUDE,
        grants: {
          where: { userId: usuario.userId, revokedAt: null },
          select: { expiresAt: true },
        },
        _count: {
          select: {
            grants: {
              where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }] },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    return linhas.map((l) => {
      const souDono = l.ownerId === usuario.userId;
      return {
        ...CofreService.paraView(l, souDono),
        via: souDono ? ('DONO' as const) : ('COMPARTILHADO' as const),
        meuAcessoAte: souDono ? null : (l.grants[0]?.expiresAt?.toISOString() ?? null),
        compartilhadoCom: souDono ? l._count.grants : null,
      };
    });
  }

  /**
   * Tudo que existe na organização, para quem administra o cofre.
   *
   * Metadado, nunca senha: serve para achar o que ficou sem dono e para
   * assumir o que precisa ser assumido.
   */
  async todos(usuario: UsuarioAutenticado): Promise<SegredoView[]> {
    const agora = new Date();

    const linhas = await this.prisma.secret.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        ...INCLUDE,
        _count: {
          select: {
            grants: {
              where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }] },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    return linhas.map((l) => ({
      ...CofreService.paraView(l, l.ownerId === usuario.userId),
      // `ADMINISTRACAO`, e não `COMPARTILHADO`: quem administra vê que
      // o segredo existe, não porque alguém o dividiu com ele.
      via: l.ownerId === usuario.userId ? ('DONO' as const) : ('ADMINISTRACAO' as const),
      meuAcessoAte: null,
      compartilhadoCom: l._count.grants,
    }));
  }

  // -------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------

  async criar(usuario: UsuarioAutenticado, dto: EscreverSegredoDto): Promise<SegredoView> {
    this.exigirCofre();

    if (!dto.senha) throw new BadRequestException('Informe a senha a guardar.');
    CofreService.exigirCamposDoTipo(dto);
    await this.exigirAtivo(usuario, dto.assetId);

    const sal = novoSal();
    // O id sai daqui e não do banco porque ele entra na cifragem: sem
    // conhecê-lo antes, seria preciso gravar, cifrar e regravar — e a
    // linha existiria por um instante com a senha em claro.
    const id = crypto.randomUUID();

    const criado = await this.prisma.secret.create({
      data: {
        id,
        organizationId: usuario.organizationId,
        ownerId: usuario.userId,
        kind: dto.kind,
        name: dto.name.trim(),
        login: dto.login.trim(),
        sal,
        senhaCifrada: cifrarSenha(dto.senha, {
          sal,
          secretId: id,
          organizationId: usuario.organizationId,
        }),
        url: dto.url?.trim() || null,
        assetId: dto.assetId ?? null,
        sistema: dto.sistema?.trim() || null,
        notas: dto.notas?.trim() || null,
      },
      include: INCLUDE,
    });

    await this.auditoria.registrar(usuario, {
      action: 'cofre.segredo.criado',
      entity: 'Secret',
      entityId: id,
      // `depois` sem a senha, de propósito: trilha que guarda segredo é
      // um segundo lugar de onde ele vaza, e esse não é cifrado.
      depois: { name: criado.name, login: criado.login, kind: criado.kind },
    });

    return { ...CofreService.paraView(criado, true), via: 'DONO', meuAcessoAte: null, compartilhadoCom: 0 };
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EscreverSegredoDto,
  ): Promise<SegredoView> {
    this.exigirCofre();
    const atual = await this.exigirDono(usuario, id);
    CofreService.exigirCamposDoTipo(dto);
    await this.exigirAtivo(usuario, dto.assetId);

    // Omitir a senha mantém a guardada. A tela não a mostra, então não
    // tem como reenviá-la — sem esta distinção, corrigir o login
    // apagaria a senha.
    const senha = dto.senha
      ? {
          senhaCifrada: cifrarSenha(dto.senha, {
            sal: atual.sal,
            secretId: atual.id,
            organizationId: usuario.organizationId,
          }),
        }
      : {};

    const salvo = await this.prisma.secret.update({
      where: { id },
      data: {
        kind: dto.kind,
        name: dto.name.trim(),
        login: dto.login.trim(),
        url: dto.url?.trim() || null,
        assetId: dto.assetId ?? null,
        sistema: dto.sistema?.trim() || null,
        notas: dto.notas?.trim() || null,
        ...senha,
      },
      include: INCLUDE,
    });

    await this.auditoria.registrar(usuario, {
      action: 'cofre.segredo.editado',
      entity: 'Secret',
      entityId: id,
      antes: { name: atual.name, login: atual.login, kind: atual.kind },
      depois: { name: salvo.name, login: salvo.login, kind: salvo.kind },
    });

    return {
      ...CofreService.paraView(salvo, true),
      via: 'DONO',
      meuAcessoAte: null,
      compartilhadoCom: await this.prisma.secretGrant.count({
        where: { secretId: id, revokedAt: null },
      }),
    };
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.exigirDono(usuario, id);
    await this.prisma.secret.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'cofre.segredo.removido',
      entity: 'Secret',
      entityId: id,
    });
  }

  // -------------------------------------------------------------------
  // A senha
  // -------------------------------------------------------------------

  /**
   * A senha, uma vez — e o registro de que foi lida.
   *
   * A leitura é gravada **antes** de a senha sair. Na ordem inversa,
   * uma falha entre devolver e registrar deixaria a senha vista sem
   * rastro, que é exatamente o caso que a trilha existe para cobrir.
   */
  async revelar(
    usuario: UsuarioAutenticado,
    id: string,
    ip?: string,
  ): Promise<SegredoRevelado> {
    this.exigirCofre();
    const segredo = await this.exigirAcesso(usuario, id);

    await this.prisma.secretAccess.create({
      data: { secretId: id, userId: usuario.userId, ip: ip ?? null },
    });

    await this.auditoria.registrar(usuario, {
      action: 'cofre.senha.revelada',
      entity: 'Secret',
      entityId: id,
      ip,
    });

    return {
      senha: decifrarSenha(segredo.senhaCifrada, {
        sal: segredo.sal,
        secretId: segredo.id,
        organizationId: usuario.organizationId,
      }),
    };
  }

  /** Quem abriu esta senha. Só o dono pergunta. */
  async leituras(usuario: UsuarioAutenticado, id: string): Promise<LeituraDoSegredoView[]> {
    await this.exigirDono(usuario, id);

    const linhas = await this.prisma.secretAccess.findMany({
      where: { secretId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { readAt: 'desc' },
      take: 100,
    });

    return linhas.map((l) => ({
      id: l.id,
      user: l.user,
      readAt: l.readAt.toISOString(),
    }));
  }

  // -------------------------------------------------------------------
  // Compartilhar
  // -------------------------------------------------------------------

  async concessoes(usuario: UsuarioAutenticado, id: string): Promise<ConcessaoView[]> {
    await this.exigirDono(usuario, id);

    const linhas = await this.prisma.secretGrant.findMany({
      where: { secretId: id, revokedAt: null },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const agora = new Date();
    return linhas.map((l) => ({
      id: l.id,
      user: l.user,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      vencida: Boolean(l.expiresAt && l.expiresAt <= agora),
      createdAt: l.createdAt.toISOString(),
    }));
  }

  async compartilhar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: CompartilharDto,
  ): Promise<ConcessaoView[]> {
    await this.exigirDono(usuario, id);

    if (dto.userId === usuario.userId) {
      throw new BadRequestException('Você já é o dono deste segredo.');
    }

    // Vínculo com **esta** organização: sem a checagem, um id de
    // usuário de outra empresa no corpo da requisição abriria o cofre
    // para fora de casa (CLAUDE.md, regra 3).
    const vinculo = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: dto.userId, organizationId: usuario.organizationId },
      },
      select: { userId: true },
    });
    if (!vinculo) throw new BadRequestException('Pessoa sem vínculo com esta organização.');

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('O prazo precisa ser no futuro.');
    }

    // `upsert`: compartilhar de novo com a mesma pessoa **estende o
    // prazo** em vez de criar uma segunda linha. Duas linhas para a
    // mesma pessoa é como uma revogação não revoga nada.
    await this.prisma.secretGrant.upsert({
      where: { secretId_userId: { secretId: id, userId: dto.userId } },
      update: { expiresAt, revokedAt: null, grantedBy: usuario.userId },
      create: { secretId: id, userId: dto.userId, grantedBy: usuario.userId, expiresAt },
    });

    await this.auditoria.registrar(usuario, {
      action: 'cofre.segredo.compartilhado',
      entity: 'Secret',
      entityId: id,
      depois: { para: dto.userId, ate: expiresAt?.toISOString() ?? 'sem prazo' },
    });

    return this.concessoes(usuario, id);
  }

  async revogar(
    usuario: UsuarioAutenticado,
    id: string,
    grantId: string,
  ): Promise<ConcessaoView[]> {
    await this.exigirDono(usuario, id);

    // `updateMany` com o `secretId` junto: sem ele, o id de uma
    // concessão de outro segredo revogaria acesso alheio.
    const { count } = await this.prisma.secretGrant.updateMany({
      where: { id: grantId, secretId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count > 0) {
      await this.auditoria.registrar(usuario, {
        action: 'cofre.segredo.revogado',
        entity: 'Secret',
        entityId: id,
        depois: { concessao: grantId },
      });
    }

    return this.concessoes(usuario, id);
  }

  /**
   * O administrador assume um segredo que não é dele.
   *
   * Não é leitura: a senha continua fechada até ele abri-la como dono,
   * o que gera o próprio registro. O que isto resolve é a pessoa que
   * saiu da empresa e levou o cofre junto.
   *
   * O ato é **alto**: fica na trilha, e o dono anterior recebe a
   * concessão que tinha como dono — ele continua abrindo o que já
   * abria, e passa a ver, na tela dele, que agora o segredo é de outro.
   */
  async assumir(usuario: UsuarioAutenticado, id: string): Promise<SegredoView> {
    const segredo = await this.prisma.secret.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });
    if (!segredo) throw new NotFoundException('Segredo não encontrado.');

    if (segredo.ownerId === usuario.userId) {
      throw new BadRequestException('Este segredo já é seu.');
    }

    const anterior = segredo.ownerId;

    await this.prisma.$transaction([
      this.prisma.secret.update({ where: { id }, data: { ownerId: usuario.userId } }),
      // O dono anterior não perde o acesso ao virar não-dono: assumir
      // resolve "ninguém consegue abrir", não "tirar de alguém".
      this.prisma.secretGrant.upsert({
        where: { secretId_userId: { secretId: id, userId: anterior } },
        update: { revokedAt: null, expiresAt: null, grantedBy: usuario.userId },
        create: { secretId: id, userId: anterior, grantedBy: usuario.userId, expiresAt: null },
      }),
      // A concessão que o novo dono porventura tinha deixa de fazer
      // sentido: ele abre por ser dono.
      this.prisma.secretGrant.deleteMany({ where: { secretId: id, userId: usuario.userId } }),
    ]);

    await this.auditoria.registrar(usuario, {
      action: 'cofre.segredo.assumido',
      entity: 'Secret',
      entityId: id,
      antes: { dono: anterior },
      depois: { dono: usuario.userId },
    });

    this.logger.warn(
      `Segredo ${id} assumido por ${usuario.userId} (era de ${anterior}).`,
    );

    const atualizado = await this.prisma.secret.findUniqueOrThrow({
      where: { id },
      include: INCLUDE,
    });

    return {
      ...CofreService.paraView(atualizado, true),
      via: 'DONO',
      meuAcessoAte: null,
      compartilhadoCom: await this.prisma.secretGrant.count({
        where: { secretId: id, revokedAt: null },
      }),
    };
  }

  // -------------------------------------------------------------------
  // Cercas
  // -------------------------------------------------------------------

  /** O segredo é meu? Editar, compartilhar e revogar pedem isto. */
  private async exigirDono(usuario: UsuarioAutenticado, id: string) {
    const segredo = await this.prisma.secret.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });

    if (!segredo) throw new NotFoundException('Segredo não encontrado.');

    // 403 e não 404: quem chegou aqui já sabe que o segredo existe — ou
    // porque ele aparece na lista de quem administra, ou porque ele o
    // recebeu compartilhado. Fingir que não existe confundiria sem
    // esconder nada.
    if (segredo.ownerId !== usuario.userId) {
      throw new ForbiddenException('Só o dono do segredo faz isto.');
    }

    return segredo;
  }

  /**
   * Posso abrir este segredo?
   *
   * Dono, ou concessão viva. **Administrar o cofre não entra aqui** —
   * é a regra que faz o cofre valer alguma coisa, e por isso ela mora
   * numa função só, que toda leitura atravessa.
   */
  private async exigirAcesso(usuario: UsuarioAutenticado, id: string) {
    const agora = new Date();

    const segredo = await this.prisma.secret.findFirst({
      where: {
        id,
        organizationId: usuario.organizationId,
        OR: [
          { ownerId: usuario.userId },
          {
            grants: {
              some: {
                userId: usuario.userId,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }],
              },
            },
          },
        ],
      },
    });

    if (!segredo) {
      throw new NotFoundException('Segredo não encontrado, ou você não tem acesso a ele.');
    }

    return segredo;
  }

  /** O equipamento é desta organização? */
  private async exigirAtivo(usuario: UsuarioAutenticado, assetId?: string | null): Promise<void> {
    if (!assetId) return;

    const existe = await this.prisma.asset.count({
      where: { id: assetId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Equipamento não encontrado nesta organização.');
  }

  /**
   * Cada tipo pede o seu campo.
   *
   * Um "site" sem endereço e um "sistema" sem nome são a mesma linha
   * inútil que a planilha compartilhada já produzia — e é dela que este
   * cofre está tentando tirar as senhas.
   */
  private static exigirCamposDoTipo(dto: EscreverSegredoDto): void {
    if (dto.kind === 'SITE' && !dto.url?.trim()) {
      throw new BadRequestException('Senha de site precisa do endereço.');
    }
    if (dto.kind === 'COMPUTADOR' && !dto.assetId) {
      throw new BadRequestException('Senha de computador precisa do equipamento.');
    }
    if (dto.kind === 'SISTEMA' && !dto.sistema?.trim()) {
      throw new BadRequestException('Senha de sistema precisa do nome do sistema.');
    }
  }

  /** A vista, sem a senha. Nunca com a senha. */
  private static paraView(
    s: ComRelacoes,
    souDono: boolean,
  ): Omit<SegredoView, 'via' | 'meuAcessoAte' | 'compartilhadoCom'> {
    return {
      id: s.id,
      kind: s.kind,
      name: s.name,
      login: s.login,
      url: s.url,
      sistema: s.sistema,
      asset: s.asset,
      notas: s.notas,
      owner: s.owner,
      souDono,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
