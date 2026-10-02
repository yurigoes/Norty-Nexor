import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma, type AuthSource } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { cifrar } from '../channels/segredos';
import { BUSCAS_DE_GRUPO, type BuscaDeGrupo } from '@norty-desk/shared';

import { DiretorioService } from './diretorio.service';

const SEGURANCA = ['NONE', 'STARTTLS', 'LDAPS'] as const;

/**
 * Perfis que o provisionamento automático pode dar. Gestor e
 * administrador ficam de fora de propósito: quem controla o AD do cliente
 * não pode, só por criar uma conta lá, virar administrador do Desk.
 */
const PAPEIS_DO_DIRETORIO = ['SOLICITANTE', 'AGENTE', 'SUPERVISOR'] as const;

/** Nome de atributo LDAP (RFC 4512). Vai cru dentro do filtro — por isso a regra. */
const ATRIBUTO = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
const MSG_ATRIBUTO = 'Nome de atributo LDAP: letras, números e hífen, começando por letra.';

/** Aceita nulo (apagar) além do valor; `ValidateIf` pula as outras regras quando é nulo. */
const naoNulo = (_: object, v: unknown) => v !== null;

export class CriarFonteDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MinLength(1) @MaxLength(255) host!: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsEnum(SEGURANCA) security?: (typeof SEGURANCA)[number];
  @IsString() @MinLength(3) @MaxLength(500) baseDn!: string;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(500) bindDn?: string | null;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(500) bindPassword?: string | null;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) loginField?: string;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) syncField?: string;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(1000) userFilter?: string | null;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) emailField?: string;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) nameField?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(ATRIBUTO, { message: MSG_ATRIBUTO })
  phoneField?: string | null;
  @IsOptional() @IsInt() @Min(1000) @Max(30000) timeoutMs?: number;
  @IsOptional() @IsBoolean() autoCreate?: boolean;
  @IsOptional() @IsEnum(PAPEIS_DO_DIRETORIO) defaultRole?: (typeof PAPEIS_DO_DIRETORIO)[number];
  @IsOptional() @IsInt() @Min(0) @Max(99) position?: number;
  @IsOptional() @IsEnum(BUSCAS_DE_GRUPO) groupSearch?: BuscaDeGrupo;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) groupField?: string;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) groupMemberField?: string;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(1000) groupFilter?: string | null;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(500) groupBaseDn?: string | null;
  @IsOptional() @IsBoolean() groupNested?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Na edição tudo é opcional; `bindPassword` ausente mantém a senha guardada, `null` apaga. */
export class EditarFonteDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsEnum(SEGURANCA) security?: (typeof SEGURANCA)[number];
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) baseDn?: string;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(500) bindDn?: string | null;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(500) bindPassword?: string | null;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) loginField?: string;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) syncField?: string;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(1000) userFilter?: string | null;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) emailField?: string;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) nameField?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(ATRIBUTO, { message: MSG_ATRIBUTO })
  phoneField?: string | null;
  @IsOptional() @IsInt() @Min(1000) @Max(30000) timeoutMs?: number;
  @IsOptional() @IsBoolean() autoCreate?: boolean;
  @IsOptional() @IsEnum(PAPEIS_DO_DIRETORIO) defaultRole?: (typeof PAPEIS_DO_DIRETORIO)[number];
  @IsOptional() @IsInt() @Min(0) @Max(99) position?: number;
  @IsOptional() @IsEnum(BUSCAS_DE_GRUPO) groupSearch?: BuscaDeGrupo;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) groupField?: string;
  @IsOptional() @Matches(ATRIBUTO, { message: MSG_ATRIBUTO }) groupMemberField?: string;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(1000) groupFilter?: string | null;
  @IsOptional() @ValidateIf(naoNulo) @IsString() @MaxLength(500) groupBaseDn?: string | null;
  @IsOptional() @IsBoolean() groupNested?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Um grupo do diretório virando time e papel.
 *
 * O papel aceito é o mesmo conjunto do provisionamento
 * (`PAPEIS_DO_DIRETORIO`), e pela mesma razão, que aqui é ainda mais
 * direta: quem administra o AD do cliente escreveria um grupo chamado o
 * que quisesse e se poria dentro dele. Gestor e administrador do Desk
 * continuam sendo decisão de alguém daqui.
 */
export class EscreverMapaDeGrupoDto {
  @IsString() @MinLength(1) @MaxLength(500) group!: string;
  @IsOptional() @ValidateIf(naoNulo) @IsUUID() teamId?: string | null;
  @IsOptional() @IsBoolean() isTeamManager?: boolean;
  @IsOptional() @ValidateIf(naoNulo) @IsEnum(PAPEIS_DO_DIRETORIO) role?: (typeof PAPEIS_DO_DIRETORIO)[number] | null;
  @IsOptional() @IsInt() @Min(0) @Max(999) position?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Outro servidor do mesmo diretório.
 *
 * Só endereço, de propósito: base, conta de serviço, filtros e campos
 * continuam na fonte. Se os dados fossem outros, seria outra fonte — e
 * repetir a configuração aqui daria dois lugares para mudar o `baseDn`,
 * com o esquecido virando um login que ora acha a pessoa, ora não.
 */
export class EscreverReplicaDto {
  @IsString() @MinLength(1) @MaxLength(255) host!: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) position?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TestarFonteDto {
  /** Um login para procurar. Sem senha: o teste nunca autentica a pessoa. */
  @IsOptional() @IsString() @MaxLength(256) login?: string;
}

/** O que a tela vê: a senha de serviço vira "existe ou não". */
function paraTela(f: AuthSource) {
  const { bindPassword, ...resto } = f;
  return { ...resto, hasBindPassword: Boolean(bindPassword) };
}

/** Texto opcional: vazio vira nulo; ausente continua ausente (não mexe). */
const opcional = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

/**
 * Fontes de autenticação da organização — o `glpi_authldaps` do Desk
 * (docs/13). Cada cliente traz o próprio AD, então a fonte é da
 * organização, e só o administrador dela a vê.
 */
@Controller('auth-sources')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FontesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly diretorio: DiretorioService,
  ) {}

  @Get()
  @RequirePermission('config:autenticacao')
  async listar(@CurrentUser() usuario: UsuarioAutenticado) {
    const fontes = await this.prisma.authSource.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: true } },
        replicas: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    return fontes.map(({ _count, ...f }) => ({ ...paraTela(f), userCount: _count.users }));
  }

  @Post()
  @RequirePermission('config:autenticacao')
  async criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarFonteDto, @Ip() ip: string) {
    const senha = opcional(dto.bindPassword);
    const fonte = await this.salvando(() =>
      this.prisma.authSource.create({
        data: {
          ...this.dados(dto),
          name: dto.name.trim(),
          host: dto.host.trim(),
          baseDn: dto.baseDn.trim(),
          organizationId: usuario.organizationId,
          bindPassword: senha ? cifrar(senha) : null,
        },
      }),
    );

    await this.auditoria.registrar(usuario, {
      action: 'fonte-autenticacao.criada',
      entity: 'AuthSource',
      entityId: fonte.id,
      ip,
      depois: paraTela(fonte),
    });
    return { ...paraTela(fonte), userCount: 0 };
  }

  @Patch(':id')
  @RequirePermission('config:autenticacao')
  async editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarFonteDto,
    @Ip() ip: string,
  ) {
    const antes = await this.exigir(usuario, id);
    const senha = opcional(dto.bindPassword);

    const fonte = await this.salvando(() =>
      this.prisma.authSource.update({
        where: { id },
        data: {
          ...this.dados(dto),
          name: dto.name?.trim(),
          host: dto.host?.trim(),
          baseDn: dto.baseDn?.trim(),
          ...(senha === undefined ? {} : { bindPassword: senha ? cifrar(senha) : null }),
        },
      }),
    );

    // O diff registra que a senha mudou, nunca a senha.
    await this.auditoria.registrar(usuario, {
      action: 'fonte-autenticacao.editada',
      entity: 'AuthSource',
      entityId: id,
      ip,
      antes: { ...paraTela(antes), senhaTrocada: false },
      depois: { ...paraTela(fonte), senhaTrocada: senha !== undefined },
    });
    return paraTela(fonte);
  }

  /**
   * Desativa, não exclui: as pessoas vindas do diretório apontam para a
   * fonte, e sem ela virariam contas locais com senha que ninguém sabe.
   */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('config:autenticacao')
  async desativar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.exigir(usuario, id);
    await this.prisma.authSource.update({ where: { id }, data: { isActive: false } });
    await this.auditoria.registrar(usuario, {
      action: 'fonte-autenticacao.desativada',
      entity: 'AuthSource',
      entityId: id,
      ip,
      antes: { isActive: true },
      depois: { isActive: false },
    });
  }

  @Post(':id/testar')
  @HttpCode(200)
  @RequirePermission('config:autenticacao')
  async testar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestarFonteDto,
  ) {
    return this.diretorio.testar(await this.exigir(usuario, id), dto.login);
  }

  private dados(dto: CriarFonteDto | EditarFonteDto) {
    return {
      port: dto.port,
      security: dto.security,
      bindDn: opcional(dto.bindDn),
      loginField: dto.loginField,
      syncField: dto.syncField,
      userFilter: opcional(dto.userFilter),
      emailField: dto.emailField,
      nameField: dto.nameField,
      phoneField: opcional(dto.phoneField),
      timeoutMs: dto.timeoutMs,
      autoCreate: dto.autoCreate,
      defaultRole: dto.defaultRole,
      position: dto.position,
      isActive: dto.isActive,
    };
  }

  // -------------------------------------------------------------------
  // Mapa de grupos
  // -------------------------------------------------------------------

  @Get(':id/grupos')
  @RequirePermission('config:autenticacao')
  async grupos(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigir(usuario, id);
    return this.listarGrupos(id);
  }

  @Post(':id/grupos')
  @RequirePermission('config:autenticacao')
  async criarGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverMapaDeGrupoDto,
  ) {
    const fonte = await this.exigir(usuario, id);
    await this.exigirTime(usuario, dto.teamId);

    const grupo = dto.group.trim().replace(/\s+/g, ' ');

    const criado = await this.mapeando(grupo, () =>
      this.prisma.directoryGroupMap.create({
        data: {
          organizationId: usuario.organizationId,
          authSourceId: fonte.id,
          group: grupo,
          teamId: dto.teamId ?? null,
          isTeamManager: dto.isTeamManager ?? false,
          role: dto.role ?? null,
          position: dto.position ?? 0,
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        select: { id: true },
      }),
    );

    await this.auditoria.registrar(usuario, {
      action: 'diretorio.grupo-mapeado',
      entity: 'DirectoryGroupMap',
      entityId: criado.id,
      depois: { fonte: fonte.name, grupo, teamId: dto.teamId ?? null, role: dto.role ?? null },
    });

    return this.listarGrupos(id);
  }

  @Patch(':id/grupos/:mapaId')
  @RequirePermission('config:autenticacao')
  async editarGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mapaId', ParseUUIDPipe) mapaId: string,
    @Body() dto: EscreverMapaDeGrupoDto,
  ) {
    const fonte = await this.exigir(usuario, id);
    await this.exigirMapa(fonte.id, mapaId);
    await this.exigirTime(usuario, dto.teamId);

    const grupo = dto.group.trim().replace(/\s+/g, ' ');

    await this.mapeando(grupo, () =>
      this.prisma.directoryGroupMap.update({
        where: { id: mapaId },
        data: {
          group: grupo,
          teamId: dto.teamId ?? null,
          isTeamManager: dto.isTeamManager ?? false,
          role: dto.role ?? null,
          ...(dto.position === undefined ? {} : { position: dto.position }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      }),
    );

    await this.auditoria.registrar(usuario, {
      action: 'diretorio.grupo-remapeado',
      entity: 'DirectoryGroupMap',
      entityId: mapaId,
      depois: { fonte: fonte.name, grupo, teamId: dto.teamId ?? null, role: dto.role ?? null },
    });

    return this.listarGrupos(id);
  }

  /**
   * Apaga o mapa — e **não** desfaz o que ele concedeu.
   *
   * Quem tirou o mapa pode ter tirado por engano, e varrer os times de
   * todo mundo na hora seria caro e irreversível. O desfazer acontece no
   * próximo login de cada pessoa, que é quando o mapa some da conta dela:
   * o vínculo marcado como do diretório deixa de ser concedido e sai.
   */
  @Delete(':id/grupos/:mapaId')
  @RequirePermission('config:autenticacao')
  async removerGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mapaId', ParseUUIDPipe) mapaId: string,
  ) {
    const fonte = await this.exigir(usuario, id);
    const mapa = await this.exigirMapa(fonte.id, mapaId);

    await this.prisma.directoryGroupMap.delete({ where: { id: mapaId } });

    await this.auditoria.registrar(usuario, {
      action: 'diretorio.grupo-desmapeado',
      entity: 'DirectoryGroupMap',
      entityId: mapaId,
      antes: { fonte: fonte.name, grupo: mapa.group },
    });

    return this.listarGrupos(id);
  }

  // -------------------------------------------------------------------
  // Réplicas
  // -------------------------------------------------------------------

  @Get(':id/replicas')
  @RequirePermission('config:autenticacao')
  async replicas(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigir(usuario, id);
    return this.listarReplicas(id);
  }

  @Post(':id/replicas')
  @RequirePermission('config:autenticacao')
  async criarReplica(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverReplicaDto,
  ) {
    const fonte = await this.exigir(usuario, id);
    const { host, port } = this.endereco(fonte, dto);

    const criada = await this.replicando(host, port, () =>
      this.prisma.authSourceReplica.create({
        data: {
          authSourceId: fonte.id,
          host,
          port,
          position: dto.position ?? 0,
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        select: { id: true },
      }),
    );

    await this.auditoria.registrar(usuario, {
      action: 'fonte-autenticacao.replica-adicionada',
      entity: 'AuthSourceReplica',
      entityId: criada.id,
      depois: { fonte: fonte.name, host, port },
    });

    return this.listarReplicas(id);
  }

  @Patch(':id/replicas/:replicaId')
  @RequirePermission('config:autenticacao')
  async editarReplica(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('replicaId', ParseUUIDPipe) replicaId: string,
    @Body() dto: EscreverReplicaDto,
  ) {
    const fonte = await this.exigir(usuario, id);
    await this.exigirReplica(fonte.id, replicaId);
    const { host, port } = this.endereco(fonte, dto);

    await this.replicando(host, port, () =>
      this.prisma.authSourceReplica.update({
        where: { id: replicaId },
        data: {
          host,
          port,
          ...(dto.position === undefined ? {} : { position: dto.position }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      }),
    );

    await this.auditoria.registrar(usuario, {
      action: 'fonte-autenticacao.replica-editada',
      entity: 'AuthSourceReplica',
      entityId: replicaId,
      depois: { fonte: fonte.name, host, port, isActive: dto.isActive },
    });

    return this.listarReplicas(id);
  }

  /**
   * Apaga de verdade, ao contrário da fonte.
   *
   * Ninguém aponta para uma réplica: ela é endereço de reserva, não
   * origem de conta. Tirá-la só faz o login deixar de tentar aquele
   * servidor — e é exatamente o que quem a tira está pedindo.
   */
  @Delete(':id/replicas/:replicaId')
  @RequirePermission('config:autenticacao')
  async removerReplica(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('replicaId', ParseUUIDPipe) replicaId: string,
  ) {
    const fonte = await this.exigir(usuario, id);
    const replica = await this.exigirReplica(fonte.id, replicaId);

    await this.prisma.authSourceReplica.delete({ where: { id: replicaId } });

    await this.auditoria.registrar(usuario, {
      action: 'fonte-autenticacao.replica-removida',
      entity: 'AuthSourceReplica',
      entityId: replicaId,
      antes: { fonte: fonte.name, host: replica.host, port: replica.port },
    });

    return this.listarReplicas(id);
  }

  private listarReplicas(authSourceId: string) {
    return this.prisma.authSourceReplica.findMany({
      where: { authSourceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async exigirReplica(authSourceId: string, replicaId: string) {
    const replica = await this.prisma.authSourceReplica.findFirst({
      where: { id: replicaId, authSourceId },
    });
    if (!replica) throw new NotFoundException('Réplica não encontrada nesta fonte.');
    return replica;
  }

  /**
   * O endereço normalizado — e a recusa do que não é réplica.
   *
   * Cadastrar o endereço do próprio servidor principal como réplica faz
   * o login tentar duas vezes o mesmo servidor quando ele cai: espera
   * dobrada, e nenhuma chance a mais de entrar.
   */
  private endereco(fonte: AuthSource, dto: EscreverReplicaDto) {
    const host = dto.host.trim();
    const port = dto.port ?? 389;

    if (host.toLowerCase() === fonte.host.toLowerCase() && port === fonte.port) {
      throw new BadRequestException(
        'Esse é o endereço do servidor principal da fonte. A réplica é outro servidor.',
      );
    }
    return { host, port };
  }

  private async replicando<T>(host: string, port: number, operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`${host}:${port} já está cadastrado como réplica desta fonte.`);
      }
      throw e;
    }
  }

  private listarGrupos(authSourceId: string) {
    return this.prisma.directoryGroupMap.findMany({
      where: { authSourceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { team: { select: { id: true, name: true } } },
    });
  }

  private async exigirMapa(authSourceId: string, mapaId: string) {
    const mapa = await this.prisma.directoryGroupMap.findFirst({
      where: { id: mapaId, authSourceId },
    });
    if (!mapa) throw new NotFoundException('Mapa de grupo não encontrado.');
    return mapa;
  }

  /** O time é desta organização — id de outra seria atrelar gente ao time alheio. */
  private async exigirTime(usuario: UsuarioAutenticado, teamId: string | null | undefined) {
    if (!teamId) return;

    const existe = await this.prisma.team.count({
      where: { id: teamId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Time não encontrado nesta organização.');
  }

  private async mapeando<T>(grupo: string, operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          `O grupo "${grupo}" já está mapeado nesta fonte. Edite o mapa que existe.`,
        );
      }
      throw e;
    }
  }

  private async salvando<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Já existe uma fonte com este nome nesta organização.');
      }
      throw e;
    }
  }

  private async exigir(usuario: UsuarioAutenticado, id: string) {
    const fonte = await this.prisma.authSource.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!fonte) throw new NotFoundException('Fonte de autenticação não encontrada.');
    return fonte;
  }
}
