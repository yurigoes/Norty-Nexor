import {
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
      include: { _count: { select: { users: true } } },
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
