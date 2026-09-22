import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClienteDetail,
  ClienteView,
  PessoaDoClienteView,
} from '@norty-desk/shared';
import { loginDoCliente, loginLivre, pinFraco, telefoneBrasileiro } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuthService } from '../auth/auth.service';
import type {
  DefinirPinDto,
  EditarClienteDto,
  EscreverClienteDto,
  EscreverPessoaDoClienteDto,
} from './dto';

/** O PIN nasce indefinido; a pessoa o escolhe no primeiro acesso. */
const SEM_PIN = '';

/**
 * A carteira de clientes da Norty.
 *
 * Cada empresa é um `Client` **dentro** da organização — não uma
 * organização separada. Ver `docs/13-carteira-e-campo.md`, seção 1.
 *
 * O login da pessoa não se digita: sai do nome mais o domínio da
 * empresa (`loginDoCliente`, em `packages/shared`). Pedir o login à mão
 * seria pedir a quem cadastra que acerte a mesma regra cem vezes — e
 * numa delas ele sai diferente.
 */
@Injectable()
export class CarteiraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Empresas
  // -------------------------------------------------------------------

  async clientes(usuario: UsuarioAutenticado): Promise<ClienteView[]> {
    const clientes = await this.prisma.client.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        _count: { select: { memberships: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Chamados abertos por cliente numa consulta só: um `count` por
    // linha numa carteira de duzentas empresas são duzentas idas ao
    // banco, e a tela é de listagem.
    const abertos = await this.prisma.ticket.groupBy({
      by: ['clientId'],
      where: {
        organizationId: usuario.organizationId,
        clientId: { not: null },
        status: { notIn: ['SOLUCIONADO', 'FECHADO'] },
      },
      _count: { id: true },
    });
    const porCliente = new Map(abertos.map((a) => [a.clientId, a._count.id]));

    return clientes.map((c) => CarteiraService.paraView(c, porCliente.get(c.id) ?? 0));
  }

  async detalhe(usuario: UsuarioAutenticado, id: string): Promise<ClienteDetail> {
    const cliente = await this.exigir(usuario, id);

    const pessoas = await this.prisma.membership.findMany({
      where: { clientId: id },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });

    const abertos = await this.prisma.ticket.count({
      where: {
        organizationId: usuario.organizationId,
        clientId: id,
        status: { notIn: ['SOLUCIONADO', 'FECHADO'] },
      },
    });

    return {
      ...CarteiraService.paraView({ ...cliente, _count: { memberships: pessoas.length } }, abertos),
      people: pessoas.map(CarteiraService.pessoaParaView),
    };
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverClienteDto): Promise<ClienteDetail> {
    CarteiraService.exigirDominio(dto.emailDomain);

    const cliente = await this.gravando(
      () =>
        this.prisma.client.create({
          data: {
            organizationId: usuario.organizationId,
            name: dto.name.trim(),
            emailDomain: dto.emailDomain,
            document: dto.document ?? null,
            contactEmail: dto.contactEmail ?? null,
            contactPhone: dto.contactPhone ?? null,
            notes: dto.notes ?? null,
            isActive: dto.isActive ?? true,
          },
        }),
      dto,
    );

    await this.auditoria.registrar(usuario, {
      action: 'cliente.criado',
      entity: 'Client',
      entityId: cliente.id,
      depois: { name: cliente.name, emailDomain: cliente.emailDomain },
    });

    return this.detalhe(usuario, cliente.id);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarClienteDto,
  ): Promise<ClienteDetail> {
    const atual = await this.exigir(usuario, id);
    if (dto.emailDomain) CarteiraService.exigirDominio(dto.emailDomain);

    // Trocar o domínio depois de cadastrar gente deixaria os logins
    // apontando para um domínio que a empresa não usa mais — e o login
    // é a credencial, não um rótulo que se troca.
    if (dto.emailDomain && dto.emailDomain !== atual.emailDomain) {
      const pessoas = await this.prisma.membership.count({ where: { clientId: id } });
      if (pessoas > 0) {
        throw new ConflictException(
          `Esta empresa já tem ${pessoas} pessoa(s) com login em @${atual.emailDomain}. ` +
            'Trocar o domínio agora deixaria esses logins órfãos.',
        );
      }
    }

    await this.gravando(
      () =>
        this.prisma.client.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            emailDomain: dto.emailDomain,
            document: dto.document,
            contactEmail: dto.contactEmail,
            contactPhone: dto.contactPhone,
            notes: dto.notes,
            isActive: dto.isActive,
          },
        }),
      dto,
    );

    return this.detalhe(usuario, id);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const cliente = await this.exigir(usuario, id);

    const [pessoas, chamados] = await Promise.all([
      this.prisma.membership.count({ where: { clientId: id } }),
      this.prisma.ticket.count({ where: { clientId: id } }),
    ]);

    if (pessoas > 0 || chamados > 0) {
      throw new ConflictException(
        `Esta empresa tem ${pessoas} pessoa(s) e ${chamados} chamado(s): desative em vez de excluir.`,
      );
    }

    await this.prisma.client.delete({ where: { id } });
    await this.auditoria.registrar(usuario, {
      action: 'cliente.removido',
      entity: 'Client',
      entityId: id,
      antes: { name: cliente.name },
    });
  }

  // -------------------------------------------------------------------
  // Pessoas da empresa
  // -------------------------------------------------------------------

  async adicionarPessoa(
    usuario: UsuarioAutenticado,
    clientId: string,
    dto: EscreverPessoaDoClienteDto,
  ): Promise<ClienteDetail> {
    const cliente = await this.exigir(usuario, clientId);

    const desejado = loginDoCliente(dto.name, cliente.emailDomain);
    if (!desejado) {
      throw new BadRequestException(
        'Não consegui montar um login com este nome. Informe nome e sobrenome.',
      );
    }

    // Homônimo ganha sufixo. Os ocupados vêm do domínio inteiro, não só
    // desta empresa: o login é o e-mail, e e-mail é único no sistema.
    const ocupados = await this.prisma.user.findMany({
      where: { email: { endsWith: `@${cliente.emailDomain}` } },
      select: { email: true },
    });
    const login = loginLivre(
      desejado,
      ocupados.map((o) => o.email).filter((e): e is string => e !== null),
    );

    const pessoa = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.user.create({
        data: {
          email: login,
          name: dto.name.trim(),
          // Sem PIN ainda: a pessoa o escolhe no primeiro acesso, e até
          // lá não entra. Hash vazio não casa com nenhum PIN.
          passwordHash: SEM_PIN,
          phone: telefoneBrasileiro(dto.phone),
          isActive: dto.isActive ?? true,
          mustChangePassword: true,
        },
      });

      await tx.membership.create({
        data: {
          userId: criada.id,
          organizationId: usuario.organizationId,
          clientId,
          role: 'CLIENTE',
        },
      });

      return criada;
    });

    await this.auditoria.registrar(usuario, {
      action: 'cliente.pessoa.criada',
      entity: 'User',
      entityId: pessoa.id,
      depois: { login, cliente: cliente.name },
    });

    return this.detalhe(usuario, clientId);
  }

  async removerPessoa(
    usuario: UsuarioAutenticado,
    clientId: string,
    userId: string,
  ): Promise<ClienteDetail> {
    await this.exigir(usuario, clientId);

    const vinculo = await this.prisma.membership.findFirst({
      where: { clientId, userId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!vinculo) throw new NotFoundException('Pessoa não encontrada nesta empresa.');

    // Desativa em vez de apagar: a pessoa é ator nos chamados dela, e
    // apagar levaria o histórico junto.
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });

    await this.auditoria.registrar(usuario, {
      action: 'cliente.pessoa.desativada',
      entity: 'User',
      entityId: userId,
      antes: { login: vinculo.user.email },
    });

    return this.detalhe(usuario, clientId);
  }

  /**
   * O primeiro PIN, ou a troca dele.
   *
   * Quem define é quem gerencia a carteira, para entregar o PIN à
   * pessoa — e a pessoa troca depois pelo portal. Recusa PIN fraco aqui
   * também: a regra não pode morar só na tela.
   */
  async definirPin(
    usuario: UsuarioAutenticado,
    clientId: string,
    userId: string,
    dto: DefinirPinDto,
  ): Promise<ClienteDetail> {
    await this.exigir(usuario, clientId);

    const vinculo = await this.prisma.membership.findFirst({ where: { clientId, userId } });
    if (!vinculo) throw new NotFoundException('Pessoa não encontrada nesta empresa.');

    const problema = pinFraco(dto.pin);
    if (problema) throw new BadRequestException(problema);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashDeSenha(dto.pin), mustChangePassword: true },
    });

    await this.auditoria.registrar(usuario, {
      action: 'cliente.pessoa.pin-definido',
      entity: 'User',
      entityId: userId,
    });

    return this.detalhe(usuario, clientId);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async exigir(usuario: UsuarioAutenticado, id: string) {
    const cliente = await this.prisma.client.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!cliente) throw new NotFoundException('Empresa não encontrada.');
    return cliente;
  }

  /** `empresadojoao.com.br` — sem arroba, sem barra, com ponto. */
  private static exigirDominio(dominio: string): void {
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(dominio)) {
      throw new BadRequestException(
        `"${dominio}" não parece um domínio. Use a forma empresadojoao.com.br.`,
      );
    }
  }

  private async gravando<T>(operacao: () => Promise<T>, dto: { name?: string; emailDomain?: string }): Promise<T> {
    try {
      return await operacao();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        const alvo = (erro.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (alvo.includes('emailDomain')) {
          throw new ConflictException(
            `Já existe uma empresa com o domínio ${dto.emailDomain} — os logins colidiriam entre as duas.`,
          );
        }
        throw new ConflictException(`Já existe a empresa "${dto.name}".`);
      }
      throw erro;
    }
  }

  private static paraView(
    c: {
      id: string; name: string; document: string | null; emailDomain: string;
      contactEmail: string | null; contactPhone: string | null; notes: string | null;
      isActive: boolean; _count: { memberships: number };
    },
    openTickets: number,
  ): ClienteView {
    return {
      id: c.id,
      name: c.name,
      document: c.document,
      emailDomain: c.emailDomain,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      notes: c.notes,
      isActive: c.isActive,
      peopleCount: c._count.memberships,
      openTickets,
    };
  }

  private static pessoaParaView(v: {
    user: { id: string; name: string; email: string | null; phone: string | null; isActive: boolean; passwordHash: string };
  }): PessoaDoClienteView {
    return {
      id: v.user.id,
      name: v.user.name,
      login: v.user.email ?? '',
      contactEmail: v.user.email,
      phone: v.user.phone,
      isActive: v.user.isActive,
      pinPendente: v.user.passwordHash === SEM_PIN,
    };
  }
}
